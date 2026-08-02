import 'dotenv/config'
import Fastify from 'fastify'
import prismaPlugin from './plugins/prisma.js'
import jwtPlugin from './plugins/jwt.js'
import corsPlugin from './plugins/cors.js'
import helmetPlugin from './plugins/helmet.js'
import rateLimitPlugin from './plugins/rate-limit.js'
import compressPlugin from './plugins/compress.js'
import sensiblePlugin from './plugins/sensible.js'
import underPressurePlugin from './plugins/under-pressure.js'
import requestContextPlugin from './plugins/request-context.js'
import staticPlugin from './plugins/static.js'
import socketPlugin from './plugins/socket.js'
import queuePlugin from './plugins/queue.js'
import authRoutes from './modules/auth/auth.routes.js'
import {
  devicesPublicRoutes,
  devicesPrivateRoutes,
} from './modules/devices/devices.routes.js'
import { metricsPrivateRoutes } from './modules/metrics/metrics.routes.js'
import { notificationRoutes } from './modules/notifications/notifications.routes.js'
import { queueRoutes } from './modules/queue/queue.routes.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = Fastify({
  requestTimeout: 30000,
  connectionTimeout: 30000,
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    ...(process.env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty' } }
      : {}),
  },
})

// ── Infrastructure plugins ────────────────────────────────────────────────────
await app.register(prismaPlugin)
await app.register(jwtPlugin)
await app.register(corsPlugin)
await app.register(helmetPlugin)
await app.register(rateLimitPlugin)
await app.register(compressPlugin)
await app.register(sensiblePlugin)
await app.register(underPressurePlugin)
await app.register(requestContextPlugin)
await app.register(staticPlugin)
await app.register(socketPlugin)
await app.register(queuePlugin)

// ── API routes ────────────────────────────────────────────────────────────────
await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(devicesPublicRoutes, { prefix: '/api/devices' })
await app.register(devicesPrivateRoutes, { prefix: '/api/devices' })
await app.register(metricsPrivateRoutes, { prefix: '/api/devices' })
await app.register(notificationRoutes, { prefix: '/api/notifications' })
await app.register(queueRoutes, { prefix: '/api/queue' })

// ── Root route & PWA asset handlers ──────────────────────────────────────────
function resolveViewFile(filename: string): string | null {
  const candidates = [
    path.join(__dirname, 'views', filename),
    path.join(__dirname, '..', 'src', 'views', filename),
    path.join(__dirname, '..', 'views', filename),
  ]
  return candidates.find(fs.existsSync) ?? null
}

app.get('/manifest.json', async (req, reply) => {
  const manifestPath = resolveViewFile('manifest.json')
  if (manifestPath) {
    return reply.type('application/manifest+json').send(fs.createReadStream(manifestPath))
  }
  return reply.status(404).send({ error: 'Manifest not found' })
})

app.get('/sw.js', async (req, reply) => {
  const swPath = resolveViewFile('sw.js')
  if (swPath) {
    return reply.type('application/javascript').send(fs.createReadStream(swPath))
  }
  return reply.status(404).send({ error: 'Service worker not found' })
})

app.get('/', async (req, reply) => {
  const accept = req.headers.accept ?? ''
  if (accept.includes('text/html')) {
    const htmlPath = resolveViewFile('dashboard.html')
    if (htmlPath) {
      return reply.type('text/html').send(fs.createReadStream(htmlPath))
    }
    return reply
      .type('text/html')
      .send('<html><body><h1>PC Remote API Server</h1><p>Server online</p></body></html>')
  }

  return {
    name: 'PC Remote Backend API',
    status: 'ok',
    version: '0.0.2',
    health: '/health',
  }
})

app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}))

// ── Server lifecycle ──────────────────────────────────────────────────────────
const start = async () => {
  try {
    await app.listen({
      port: Number(process.env.PORT ?? 3000),
      host: '0.0.0.0',
    })


  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down gracefully`)
  await app.close()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

export { app }
export const startPromise = start()