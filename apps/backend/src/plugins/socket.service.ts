import { PrismaClient, Prisma } from '@prisma/client'
import {
  HeartbeatPayload,
  CommandResult,
  LocalUsersPayload,
} from '@pc-remote/shared'

import { NotificationsService } from '../modules/notifications/notifications.service.js'

export class SocketService {
  private notificationsService: NotificationsService

  constructor(private prisma: PrismaClient) {
    this.notificationsService = new NotificationsService(prisma)
  }

  async getDeviceByToken(token: string) {
    return this.prisma.device.findUnique({
      where: { agentToken: token },
      select: { id: true, agentVersion: true },
    })
  }

  async handleAgentConnect(deviceId: string) {
    const device = await this.prisma.device.update({
      where: { id: deviceId },
      data: { status: 'online', lastSeenAt: new Date() },
      select: { id: true, name: true, userId: true },
    })

    if (device.userId) {
      this.notificationsService.notifyUser(
        device.userId,
        'device.online',
        'Device Online',
        `PC Remote Agent on "${device.name}" is now online.`,
        { deviceId: device.id, name: device.name }
      ).catch(() => {})
    }
  }

  async handleAgentDisconnect(deviceId: string) {
    const device = await this.prisma.device.update({
      where: { id: deviceId },
      data: { status: 'offline', lastSeenAt: new Date() },
      select: { id: true, name: true, userId: true },
    })

    if (device.userId) {
      this.notificationsService.notifyUser(
        device.userId,
        'device.offline',
        'Device Offline',
        `PC Remote Agent on "${device.name}" disconnected.`,
        { deviceId: device.id, name: device.name }
      ).catch(() => {})
    }
  }

  async handleHeartbeat(deviceId: string, payload: HeartbeatPayload) {
    const { cpuPercent, ramPercent, uptime, activeUsers, agentVersion, disks, macAddress, activeWindow, networkSpeed, diskIo } =
      payload

    const today = new Date().toISOString().split('T')[0]!
    const activeAppName = activeWindow?.processName || activeWindow?.title || null

    await this.prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'online',
        lastSeenAt: new Date(),
        cpuPercent,
        ramPercent,
        uptime,
        activeUsers,
        agentVersion,
        ...(disks !== undefined && { disks }),
        ...(macAddress !== undefined && { macAddress }),
        ...(activeWindow !== undefined && { activeWindow }),
        ...(networkSpeed !== undefined && { networkSpeed }),
        ...(diskIo !== undefined && { diskIo }),
      },
    })

    try {
      const currentDaily = await this.prisma.dailyUsage.findUnique({
        where: { deviceId_date: { deviceId, date: today } },
      })
      const appUsageMap = (currentDaily?.appUsage as Record<string, number> | null) ?? {}
      // Bug #12 fix: heartbeat fires every 30 seconds, so each tick = 0.5 minutes
      if (activeAppName) {
        appUsageMap[activeAppName] = (appUsageMap[activeAppName] ?? 0) + 0.5
      }
      await Promise.all([
        this.prisma.deviceMetric.create({
          data: {
            deviceId,
            cpuPercent,
            ramPercent,
            activeApp: activeAppName,
          },
        }),
        this.prisma.dailyUsage.upsert({
          where: { deviceId_date: { deviceId, date: today } },
          create: {
            deviceId,
            date: today,
            activeMinutes: 0.5,
            appUsage: appUsageMap as Prisma.InputJsonValue,
          },
          update: {
            activeMinutes: { increment: 0.5 },
            appUsage: appUsageMap as Prisma.InputJsonValue,
          },
        }),
      ])
    } catch {
      // Ignore metric store errors
    }
  }

  async handleCommandResult(deviceId: string, payload: CommandResult) {
    const { commandId, success, error, output, executedAt } = payload

    await this.prisma.command.update({
      where: { id: commandId },
      data: {
        status: success ? 'executed' : 'failed',
        executedAt: new Date(executedAt),
        error: error ?? null,
        ...(output !== undefined && { payload: { output } }),
      },
    })

    await this.prisma.auditLog.create({
      data: {
        deviceId,
        event: success ? 'command_executed' : 'command_failed',
        details: { commandId, error },
      },
    })
  }

  async handleScreenshot(deviceId: string, image: string, capturedAt: Date) {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { screenshotImage: image, screenshotAt: capturedAt },
    })
  }

  async handleLocalUsers(deviceId: string, payload: LocalUsersPayload) {
    const { users } = payload

    await this.prisma.deviceUser.deleteMany({
      where: { deviceId },
    })

    if (users.length > 0) {
      await this.prisma.deviceUser.createMany({
        data: users.map((u) => ({
          deviceId,
          name: u.name,
          fullName: u.fullName,
          enabled: u.enabled,
        })),
      })
    }
  }
}
