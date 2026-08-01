import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { Server, Socket } from 'socket.io'
import { PrismaClient } from '@prisma/client'

import {
  WS_EVENTS,
  HeartbeatPayloadSchema,
  CommandResultSchema,
  LocalUsersPayloadSchema,
  AgentToServerEvents,
  ServerToAgentEvents,
  InterServerEvents,
  SocketData,
} from '@pc-remote/shared'
import { SocketService } from './socket.service.js'

// Расширяем FastifyInstance
declare module 'fastify' {
  interface FastifyInstance {
    io: Server<AgentToServerEvents, ServerToAgentEvents, InterServerEvents, SocketData>
    sendCommand: (deviceId: string, payload: unknown) => boolean
    sendEvent: (deviceId: string, event: string, payload: unknown) => boolean
    getDeviceScreenshot: (deviceId: string) => { image: string; capturedAt: string } | null
  }
}

type AgentSocket = Socket<AgentToServerEvents, ServerToAgentEvents, InterServerEvents, SocketData>

const screenshotCache = new Map<string, { image: string; capturedAt: string }>()

const SCREENSHOT_TTL_MS = 10 * 60 * 1000 // 10 minutes
// Bug #15 fix: cap cache size to prevent unbounded memory growth
const MAX_CACHED_SCREENSHOTS = 50

const socketPlugin = fp(async (app: FastifyInstance) => {
  const socketService = new SocketService(app.prisma as PrismaClient)

  const corsOrigins = (process.env.CORS_ORIGINS ?? process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const ioCorsOrigin =
    process.env.NODE_ENV === 'development' || corsOrigins.length === 0
      ? '*'
      : corsOrigins.length === 1
      ? corsOrigins[0]
      : corsOrigins

  const io = new Server<AgentToServerEvents, ServerToAgentEvents, InterServerEvents, SocketData>(app.server, {
    cors: {
      origin: ioCorsOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 20000,
    pingInterval: 10000,
    maxHttpBufferSize: 5 * 1024 * 1024,
  })

  // Namespace для агентов — изолируем от клиентских соединений
  const agents = io.of('/agents')

  // Middleware аутентификации агента
  agents.use(async (socket: AgentSocket, next) => {
    const token = socket.handshake.auth['token'] as string | undefined

    if (!token) {
      return next(new Error('Missing agent token'))
    }

    const device = await socketService.getDeviceByToken(token)

    if (!device) {
      return next(new Error('Invalid agent token'))
    }

    socket.data.deviceId = device.id
    socket.data.agentVersion = device.agentVersion ?? 'unknown'
    next()
  })

  agents.on('connection', (socket: AgentSocket) => {
    const { deviceId } = socket.data
    app.log.info({ deviceId }, 'Agent connected')

    void socket.join(deviceId)
    void socketService.handleAgentConnect(deviceId)

    // Heartbeat от агента
    socket.on(WS_EVENTS.AGENT_HEARTBEAT, async (raw: unknown) => {
      const parsed = HeartbeatPayloadSchema.safeParse(raw)
      if (!parsed.success) {
        app.log.warn({ deviceId, error: parsed.error }, 'Invalid heartbeat')
        return
      }

      await socketService.handleHeartbeat(deviceId, parsed.data)
    })

    // Результат выполнения команды от агента
    socket.on(WS_EVENTS.AGENT_COMMAND_RESULT, async (raw: unknown) => {
      const parsed = CommandResultSchema.safeParse(raw)
      if (!parsed.success) {
        app.log.warn({ deviceId }, 'Invalid command result')
        return
      }

      await socketService.handleCommandResult(deviceId, parsed.data)
      app.log.info({ deviceId, commandId: parsed.data.commandId, success: parsed.data.success }, 'Command result received')
    })

    // Скриншот от агента — сохраняем в кэш и в БД
    socket.on(WS_EVENTS.AGENT_SCREENSHOT, (raw: unknown) => {
      const payload = raw as Record<string, unknown>
      const image = payload['image'] as string | undefined
      if (image) {
        const now = new Date()
        // Bug #15: evict oldest entry if cache is full
        if (screenshotCache.size >= MAX_CACHED_SCREENSHOTS && !screenshotCache.has(deviceId)) {
          const oldestKey = screenshotCache.keys().next().value
          if (oldestKey) screenshotCache.delete(oldestKey)
        }
        screenshotCache.set(deviceId, { image, capturedAt: now.toISOString() })
        app.log.info({ deviceId }, 'Screenshot cached')
        void socketService.handleScreenshot(deviceId, image, now)
      }
    })

    // Синхронизация локальных пользователей Windows
    socket.on(WS_EVENTS.AGENT_LOCAL_USERS, async (raw: unknown) => {
      const parsed = LocalUsersPayloadSchema.safeParse(raw)
      if (!parsed.success) {
        app.log.warn({ deviceId }, 'Invalid local users payload')
        return
      }

      await socketService.handleLocalUsers(deviceId, parsed.data)
      app.log.info({ deviceId, count: parsed.data.users.length }, 'Local users synced')
    })

    // Агент отключился
    socket.on('disconnect', async (reason) => {
      app.log.info({ deviceId, reason }, 'Agent disconnected')
      await socketService.handleAgentDisconnect(deviceId)
    })
  })

  // Декоратор для отправки команды конкретному агенту
  app.decorate('sendCommand', (deviceId: string, payload: unknown): boolean => {
    const room = agents.adapter.rooms.get(deviceId)
    if (!room || room.size === 0) return false

    agents.to(deviceId).emit(WS_EVENTS.SERVER_COMMAND, payload as any)
    return true
  })

  app.decorate('sendEvent', (deviceId: string, event: string, payload: unknown): boolean => {
    const room = agents.adapter.rooms.get(deviceId)
    if (!room || room.size === 0) return false

    agents.to(deviceId).emit(event as any, payload as any)
    return true
  })

  app.decorate('getDeviceScreenshot', (deviceId: string) => {
    const cached = screenshotCache.get(deviceId)
    if (!cached) return null
    if (Date.now() - new Date(cached.capturedAt).getTime() > SCREENSHOT_TTL_MS) {
      screenshotCache.delete(deviceId)
      return null
    }
    return cached
  })
  app.decorate('io', io)

  // Задача: чистить устаревшие скриншоты и помечать устройства как "away"
  const staleCheckInterval = setInterval(async () => {
    const now = Date.now()
    for (const [id, cached] of screenshotCache.entries()) {
      if (now - new Date(cached.capturedAt).getTime() > SCREENSHOT_TTL_MS) {
        screenshotCache.delete(id)
      }
    }

    const twoMinutesAgo = new Date(now - 2 * 60 * 1000)

    await (app.prisma as PrismaClient).device.updateMany({
      where: {
        status: 'online',
        lastSeenAt: { lt: twoMinutesAgo },
      },
      data: { status: 'away' },
    })
  }, 30_000)

  app.addHook('onClose', () => {
    clearInterval(staleCheckInterval)
    io.close()
  })
})

export default socketPlugin