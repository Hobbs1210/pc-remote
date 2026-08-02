import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { IQueueAdapter, createQueueAdapter } from '../queue/index.js'
import { MetricsService } from '../modules/metrics/metrics.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    queue: IQueueAdapter
  }
}

const DEFAULT_COMMAND_TIMEOUT_MS = 15 * 60 * 1000 // 15 minutes default timeout

const queuePlugin = fp(async (app: FastifyInstance) => {
  const queueAdapter = createQueueAdapter()
  app.decorate('queue', queueAdapter)

  // ── Register Queue Processors ───────────────────────────────────────────────

  // 1. Metrics Pruning Job (Runs Daily)
  queueAdapter.process('metrics-pruning', async (job) => {
    app.log.info({ jobId: job.id }, 'Processing metrics pruning job')
    const metricsService = new MetricsService(app.prisma)
    await metricsService.pruneMetrics(30)
  })

  // 2. Stale Device Status Check Job (Runs Every 30s)
  queueAdapter.process('stale-device-check', async (job) => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000)
    await app.prisma.device.updateMany({
      where: {
        status: 'online',
        lastSeenAt: { lt: twoMinutesAgo },
      },
      data: { status: 'away' },
    })
  })

  // 3. Device Command & Message Delivery Worker (15-min default timeout)
  queueAdapter.process('device-commands', async (job) => {
    const { deviceId, payload, queuedAt, timeoutMs } = job.data as {
      deviceId: string
      payload: any
      queuedAt?: number
      timeoutMs?: number
    }

    const timeout = timeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS
    const startTime = queuedAt ?? job.timestamp

    if (Date.now() - startTime > timeout) {
      await app.prisma.command.update({
        where: { id: payload.commandId },
        data: {
          status: 'failed',
          error: `Command delivery timed out (Device offline for > ${Math.round(timeout / 60000)} minutes)`,
        },
      })
      app.log.warn({ commandId: payload.commandId, deviceId }, 'Command delivery timed out after 15m')
      return
    }

    const delivered = app.sendCommand(deviceId, payload)
    if (delivered) {
      await app.prisma.command.update({
        where: { id: payload.commandId },
        data: { status: 'sent', sentAt: new Date() },
      })
    } else {
      throw new Error(`Device ${deviceId} offline, retrying delivery later`)
    }
  })

  // 4. Async Audit Logger Worker
  queueAdapter.process('audit-logs', async (job) => {
    const { deviceId, event, details } = job.data as { deviceId: string; event: string; details?: any }
    await app.prisma.auditLog.create({
      data: { deviceId, event, details },
    })
  })

  // 5. 🌐 Webhook Events Delivery Worker (Supports Discord, Slack & Custom Webhooks)
  queueAdapter.process('webhook-delivery', async (job) => {
    const { url, event, data } = job.data as { url: string; event: string; data: any }
    try {
      let body: any = { event, data, timestamp: new Date().toISOString() }

      if (url.includes('discord.com/api/webhooks')) {
        body = {
          content: `🚨 **PC Remote Event Alert**: \`${event}\``,
          embeds: [
            {
              title: `Event: ${event}`,
              color: 0x7c3aed,
              fields: Object.entries(data || {}).map(([k, v]) => ({
                name: k,
                value: String(v),
                inline: true,
              })),
              timestamp: new Date().toISOString(),
            },
          ],
        }
      } else if (url.includes('hooks.slack.com')) {
        body = {
          text: `🚨 *PC Remote Event Alert*: \`${event}\`\n\`\`\`${JSON.stringify(data, null, 2)}\`\`\``,
        }
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        throw new Error(`Webhook target responded with status ${res.status}`)
      }
    } catch (err) {
      app.log.warn({ url, event, err }, 'Webhook delivery attempt failed')
      throw err
    }
  })

  // 6. 🔄 Agent Version Upgrade Manager Worker (Checks GitHub Releases API)
  queueAdapter.process('agent-updates', async (job) => {
    const onlineDevices = await app.prisma.device.findMany({
      where: { status: 'online' },
      select: { id: true, agentVersion: true, name: true },
    })

    if (onlineDevices.length === 0) return

    try {
      const res = await fetch('https://api.github.com/repos/Hobbs1210/pc-remote/releases/latest', {
        headers: { 'User-Agent': 'PCRemote-Backend' },
      })
      if (!res.ok) return

      const release = (await res.json()) as { tag_name: string; assets: Array<{ browser_download_url: string }> }
      const latestVersion = release.tag_name.replace(/^v/, '')
      const asset = release.assets.find(
        (a) => a.browser_download_url.endsWith('.zip') || a.browser_download_url.endsWith('.exe')
      )

      if (!latestVersion || !asset) return

      for (const device of onlineDevices) {
        if (device.agentVersion !== latestVersion) {
          app.sendCommand(device.id, {
            type: 'UPDATE_AGENT',
            version: latestVersion,
            downloadUrl: asset.browser_download_url,
          })
          app.log.info({ deviceId: device.id, current: device.agentVersion, target: latestVersion }, 'Triggered silent agent update')
        }
      }
    } catch (err) {
      app.log.warn({ err }, 'Agent release check failed')
    }
  })

  // 7. Real-Time Terminal & Command Log Buffering Worker
  queueAdapter.process('terminal-logs', async (job) => {
    const { commandId, output, error } = job.data as { commandId: string; output?: string; error?: string }
    await app.prisma.command.update({
      where: { id: commandId },
      data: {
        status: error ? 'failed' : 'executed',
        output: output ?? null,
        error: error ?? null,
        executedAt: new Date(),
      },
    })
  })

  // 8. 🔔 Push Notification Dispatcher (Expo Push / FCM / APNs)
  queueAdapter.process('push-notifications', async (job) => {
    const { pushToken, title, body, data } = job.data as {
      pushToken: string
      title: string
      body: string
      data?: Record<string, any>
    }

    if (!pushToken) return

    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          to: pushToken,
          sound: 'default',
          title,
          body,
          data,
          priority: 'high',
        }),
      })

      if (!res.ok) {
        throw new Error(`Push notification gateway responded with status ${res.status}`)
      }
    } catch (err) {
      app.log.warn({ pushToken, title, err }, 'Push notification dispatch failed')
      throw err
    }
  })

  // 9. 📊 Usage Analytics Aggregation Worker
  queueAdapter.process('analytics-aggregation', async (job) => {
    const { deviceId } = job.data as { deviceId?: string }
    app.log.info({ jobId: job.id, deviceId }, 'Processing analytics aggregation')

    const devices = deviceId
      ? [{ id: deviceId }]
      : await app.prisma.device.findMany({ select: { id: true } })

    for (const dev of devices) {
      const metrics = await app.prisma.deviceMetric.findMany({
        where: { deviceId: dev.id },
        orderBy: { timestamp: 'desc' },
        take: 288,
      })

      if (metrics.length === 0) continue

      const avgCpu = Math.round(metrics.reduce((acc, m) => acc + m.cpuPercent, 0) / metrics.length)
      const avgRam = Math.round(metrics.reduce((acc, m) => acc + m.ramPercent, 0) / metrics.length)

      await app.prisma.auditLog.create({
        data: {
          deviceId: dev.id,
          event: 'analytics_aggregated',
          details: { avgCpu, avgRam, sampleCount: metrics.length, aggregatedAt: new Date().toISOString() },
        },
      })
    }
  })

  // 10. 🛡️ Security Intrusion Capture & Snapshot Worker
  queueAdapter.process('security-captures', async (job) => {
    const { deviceId, alertType, details } = job.data as {
      deviceId: string
      alertType: string
      details?: Record<string, any>
    }

    app.log.warn({ deviceId, alertType }, 'Processing security capture alert')

    app.sendCommand(deviceId, { type: 'SCREENSHOT' })

    await app.prisma.auditLog.create({
      data: {
        deviceId,
        event: `security_alert_${alertType}`,
        details: { alertType, ...details, timestamp: new Date().toISOString() },
      },
    })
  })

  // ── Schedule Repeatable Maintenance Jobs ──────────────────────────────────
  await queueAdapter.add('metrics-pruning', 'prune-old-metrics', {}, {
    repeat: { every: 24 * 60 * 60 * 1000 },
  })

  await queueAdapter.add('stale-device-check', 'check-stale-status', {}, {
    repeat: { every: 30 * 1000 },
  })

  await queueAdapter.add('agent-updates', 'check-agent-upgrades', {}, {
    repeat: { every: 12 * 60 * 60 * 1000 },
  })

  await queueAdapter.add('analytics-aggregation', 'aggregate-daily-analytics', {}, {
    repeat: { every: 6 * 60 * 60 * 1000 }, // Every 6 hours
  })

  app.addHook('onClose', async () => {
    app.log.info('Closing Queue Adapter')
    await queueAdapter.close()
  })
})

export default queuePlugin
