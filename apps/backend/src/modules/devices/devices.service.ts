import { PrismaClient, Prisma } from '@prisma/client'
import { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import dgram from 'node:dgram'
import bcrypt from 'bcryptjs'
import { WS_EVENTS } from '@pc-remote/shared'
import { NotificationsService } from '../notifications/notifications.service.js'
import type {
  BindDeviceInput,
  SendCommandInput,
  UpdateScheduleInput,
  BonusTimeInput,
} from './devices.schema.js'

function createWolMagicPacket(mac: string): Buffer {
  const cleanMac = mac.replace(/[^a-fA-F0-9]/g, '')
  if (cleanMac.length !== 12) throw new Error('Invalid MAC address')

  const macBytes = Buffer.from(cleanMac, 'hex')
  const packet = Buffer.alloc(6 + 16 * 6)

  packet.fill(0xff, 0, 6)
  for (let i = 0; i < 16; i++) {
    macBytes.copy(packet, 6 + i * 6)
  }
  return packet
}

function sendWolPacket(mac: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const packet = createWolMagicPacket(mac)
      const socket = dgram.createSocket('udp4')

      socket.on('error', () => {
        try { socket.close() } catch {}
        resolve(false)
      })

      socket.bind(() => {
        socket.setBroadcast(true)
        socket.send(packet, 0, packet.length, 9, '255.255.255.255', (err) => {
          try { socket.close() } catch {}
          resolve(!err)
        })
      })
    } catch {
      resolve(false)
    }
  })
}

import fs from 'node:fs'

function getPackageVersion(): string {
  try {
    const pkgPath = new URL('../../../package.json', import.meta.url)
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string }
      if (pkg.version) return `v${pkg.version}`
    }
  } catch {}
  return 'v0.0.2'
}

const DEFAULT_AGENT_VERSION = getPackageVersion()

export class DeviceError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string = 'DEVICE_ERROR'
  ) {
    super(message)
    this.name = 'DeviceError'
  }
}

export class DevicesService {

  constructor(
    private prisma: PrismaClient,
    private app: FastifyInstance
  ) {}

  async initDevice(deviceId: string, timezone: string) {
    const existing = await this.prisma.device.findUnique({
      where: { id: deviceId },
    })
    if (existing) throw new DeviceError('Device already registered', 409, 'DEVICE_ALREADY_REGISTERED')
  
    const secret = crypto.randomBytes(32).toString('hex')
    const secretHash = await bcrypt.hash(secret, 10)
  
    await this.prisma.device.create({
      data: {
        id: deviceId,
        name: 'Unbound Device',
        secret: secretHash,
        timezone,
        status: 'offline',
        userId: null,
      },
    })
  
    return { deviceId, secret }
  }

  async bindDevice(userId: string, input: BindDeviceInput) {
    const device = await this.prisma.device.findUnique({
      where: { id: input.deviceId },
    })
  
    if (!device) throw new DeviceError('Device not found', 404, 'DEVICE_NOT_FOUND')
    if (device.userId !== null) {
      throw new DeviceError('Device already bound', 409, 'DEVICE_ALREADY_BOUND')
    }
  
    const secretValid = await bcrypt.compare(input.secret, device.secret)
    if (!secretValid) throw new DeviceError('Invalid secret', 403, 'INVALID_SECRET')
  
    const agentToken = crypto.randomBytes(48).toString('hex')
  
    const updated = await this.prisma.device.update({
      where: { id: input.deviceId },
      data: {
        userId,
        name: input.name,
        timezone: input.timezone,
        agentToken,
      },
      select: {
        id: true,
        name: true,
        status: true,
        timezone: true,
        createdAt: true,
      },
    })
  
    await this.prisma.schedule.upsert({
      where: { deviceId: input.deviceId },
      create: {
        deviceId: input.deviceId,
        enabled: false,
        timezone: input.timezone,
      },
      update: {},
    })
  
    return { device: updated, agentToken }
  }

  async getUserDevices(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        cpuPercent: true,
        ramPercent: true,
        uptime: true,
        activeUsers: true,
        agentVersion: true,
        timezone: true,
        macAddress: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getDevice(userId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
      select: {
        id: true,
        name: true,
        status: true,
        lastSeenAt: true,
        cpuPercent: true,
        ramPercent: true,
        uptime: true,
        activeUsers: true,
        agentVersion: true,
        timezone: true,
        platform: true,
        macAddress: true,
        networkSpeed: true,
        diskIo: true,
        installedApps: true,
        createdAt: true,
        updatedAt: true,
        schedule: true,
      },
    })
  
    if (!device) throw new DeviceError('Device not found', 404, 'DEVICE_NOT_FOUND')
    return device
  }

  async wakeOnLan(userId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
      select: { id: true, macAddress: true },
    })
    if (!device) throw new DeviceError('Device not found', 404, 'DEVICE_NOT_FOUND')
    if (!device.macAddress) throw new DeviceError('Device MAC address not recorded', 400, 'MAC_ADDRESS_MISSING')

    const sent = await sendWolPacket(device.macAddress)
    return { success: sent, macAddress: device.macAddress }
  }


  async sendCommand(userId: string, deviceId: string, input: SendCommandInput) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    })
    if (!device) throw new DeviceError('Device not found', 404, 'DEVICE_NOT_FOUND')

    const command = await this.prisma.command.create({
      data: {
        deviceId,
        type: input.type,
        payload: {
          delaySeconds: input.delaySeconds,
          message: input.message,
          pid: input.pid,
          commandText: input.commandText,
          volumePercent: input.volumePercent,
          volumeSteps: input.volumeSteps,
          downloadUrl: input.downloadUrl,
          version: input.version,
        },
        status: 'pending',
      },
    })

    const payload = {
      commandId: command.id,
      type: input.type,
      delaySeconds: input.delaySeconds,
      message: input.message,
      pid: input.pid,
      commandText: input.commandText,
      volumePercent: input.volumePercent,
      volumeSteps: input.volumeSteps,
      downloadUrl: input.downloadUrl,
      version: input.version,
    }

    const delivered = this.app.sendCommand(deviceId, payload)


    if (delivered) {
      await this.prisma.command.update({
        where: { id: command.id },
        data: { status: 'sent', sentAt: new Date() },
      })
    } else {
      void this.app.queue.add(
        'device-commands',
        `deliver-${command.id}`,
        { deviceId, payload, queuedAt: Date.now(), timeoutMs: 15 * 60 * 1000 },
        {
          attempts: 15,
          backoff: 5000,
          delay: (input.delaySeconds ?? 0) > 0 ? input.delaySeconds! * 1000 : 2000,
        }
      )
    }

    void this.app.queue.add('audit-logs', `audit-${command.id}`, {
      deviceId,
      event: 'command_sent',
      details: { commandId: command.id, type: input.type, delivered, pid: input.pid },
    })

    return { command, delivered }
  }


  async emergencyLockAll(userId: string) {
    const userDevices = await this.prisma.device.findMany({
      where: { userId },
      select: { id: true, name: true },
    })

    const results = await Promise.all(
      userDevices.map(async (d) => {
        try {
          return await this.sendCommand(userId, d.id, {
            type: 'LOCK',
            delaySeconds: 0,
            message: 'Emergency Lockdown Triggered',
          })
        } catch {
          return { delivered: false }
        }
      })
    )

    if (userId) {
      const notifService = new NotificationsService(this.prisma)
      notifService.notifyUser(
        userId,
        'security.emergency_lock',
        '🚨 Emergency Lockdown Triggered',
        `Lock signal dispatched to ${userDevices.length} registered PC(s).`,
        { total: userDevices.length }
      ).catch(() => {})
    }

    return { total: userDevices.length, locked: results.filter((r) => r.delivered).length }
  }


  async updateSchedule(
    userId: string,
    deviceId: string,
    input: UpdateScheduleInput
  ) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    })
    if (!device) throw new DeviceError('Device not found', 404, 'DEVICE_NOT_FOUND')

    const data = {
      enabled: input.enabled,
      timezone: input.timezone,
      days: input.days as Prisma.InputJsonValue,
      downtime: input.downtime !== undefined ? (input.downtime as Prisma.InputJsonValue) : Prisma.JsonNull,
      dailyLimit: input.dailyLimit !== undefined ? (input.dailyLimit as Prisma.InputJsonValue) : Prisma.JsonNull,
      blockedApps: (input.blockedApps ?? []) as Prisma.InputJsonValue,
      lockUntil: input.lockUntil ? new Date(input.lockUntil) : null,
    }

    const schedule = await this.prisma.schedule.upsert({
      where: { deviceId },
      create: { deviceId, ...data },
      update: data,
    })


    // Отправляем обновление агенту через WebSocket
    this.app.sendEvent(deviceId, WS_EVENTS.SERVER_SCHEDULE_UPDATE, schedule)

    return schedule
  }

  async addBonusTime(userId: string, deviceId: string, input: BonusTimeInput) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    })
    if (!device) throw new DeviceError('Device not found', 404, 'DEVICE_NOT_FOUND')

    // Отправляем бонусное время агенту через WebSocket
    const delivered = this.app.sendEvent(deviceId, WS_EVENTS.SERVER_BONUS_UPDATE, { minutes: input.minutes })

    return { minutes: input.minutes, delivered }
  }

  async deleteDevice(userId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    })
    if (!device) throw new DeviceError('Device not found', 404, 'DEVICE_NOT_FOUND')

    // Уведомляем агент до удаления — пока socket ещё аутентифицирован
    this.app.io.of('/agents').to(deviceId).emit(WS_EVENTS.SERVER_UNBIND, { deviceId })

    await this.prisma.device.delete({ where: { id: deviceId } })
  }

  async getAnalytics(userId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    })
    if (!device) throw new DeviceError('Device not found', 404, 'DEVICE_NOT_FOUND')

    const dailyUsages = await this.prisma.dailyUsage.findMany({
      where: { deviceId },
      orderBy: { date: 'desc' },
      take: 7,
    })

    const metrics = await this.prisma.deviceMetric.findMany({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
      take: 24,
    })

    // Compute top apps usage breakdown
    const appMap: Record<string, number> = {}
    for (const d of dailyUsages) {
      const usage = (d.appUsage as Record<string, number> | null) ?? {}
      for (const [appName, minutes] of Object.entries(usage)) {
        appMap[appName] = (appMap[appName] ?? 0) + minutes
      }
    }

    const topApps = Object.entries(appMap)
      .map(([name, minutes]) => ({ name, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5)

    return {
      dailyUsages: dailyUsages.reverse(),
      metrics: metrics.reverse(),
      topApps,
    }
  }

  async triggerAgentUpdate(userId: string, deviceId: string, customUrl?: string, customVersion?: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
    })
    if (!device) throw new DeviceError('Device not found', 404, 'DEVICE_NOT_FOUND')

    let version = customVersion ?? DEFAULT_AGENT_VERSION
    let downloadUrl = customUrl ?? 'https://github.com/Hobbs1210/pc-remote/releases/latest/download/PC-Remote-Setup.exe'

    try {
      if (!customUrl) {
        const res = await fetch('https://api.github.com/repos/Hobbs1210/pc-remote/releases/latest', {
          headers: { 'User-Agent': 'PC-Remote-Backend' },
        })
        if (res.ok) {
          const data = (await res.json()) as { tag_name?: string; assets?: Array<{ name: string; browser_download_url: string }> }
          if (data.tag_name) version = data.tag_name
          const asset = data.assets?.find((a) => a.name.endsWith('.exe'))
          if (asset?.browser_download_url) downloadUrl = asset.browser_download_url
        }
      }
    } catch {
      // Fallback to default release URL
    }

    const result = await this.sendCommand(userId, deviceId, {
      type: 'UPDATE_AGENT',
      delaySeconds: 0,
      downloadUrl,
      version,
    })

    return { version, downloadUrl, delivered: result.delivered }
  }

  // Bug #6 fix: verify device secret before exposing agentToken
  async getAgentToken(deviceId: string, secret: string) {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { agentToken: true, secret: true },
    })

    if (!device) throw new DeviceError('Device not found', 404, 'DEVICE_NOT_FOUND')

    // Verify the secret matches the hashed secret stored during initDevice
    const secretValid = await bcrypt.compare(secret, device.secret)
    if (!secretValid) throw new DeviceError('Invalid secret', 403, 'INVALID_SECRET')

    return { agentToken: device.agentToken ?? null }
  }

  async getDeviceUsers(userId: string, deviceId: string) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
      select: { id: true },
    })

    if (!device) throw new DeviceError('Device not found', 404, 'DEVICE_NOT_FOUND')

    return this.prisma.deviceUser.findMany({
      where: { deviceId },
      orderBy: { name: 'asc' },
    })
  }

  async getCommandHistory(userId: string, deviceId: string, limit = 20) {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, userId },
      select: { id: true },
    })

    if (!device) throw new DeviceError('Device not found', 404, 'DEVICE_NOT_FOUND')

    return this.prisma.command.findMany({
      where: {
        deviceId,
        device: { userId },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }
}
