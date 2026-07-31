import { PrismaClient } from '@prisma/client'
import crypto from 'node:crypto'

export class NotificationsService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Registers an Expo push token for a user
   */
  async registerPushToken(userId: string, expoPushToken: string, deviceName?: string) {
    const name = deviceName ?? null
    return this.prisma.pushSubscription.upsert({
      where: { expoPushToken },
      update: { userId, deviceName: name },
      create: { userId, expoPushToken, deviceName: name },
    })
  }

  /**
   * Removes a push token subscription
   */
  async unregisterPushToken(expoPushToken: string) {
    return this.prisma.pushSubscription.deleteMany({
      where: { expoPushToken },
    })
  }

  /**
   * Creates a webhook subscription for a user
   */
  async createWebhook(userId: string, url: string, events: string[], secret?: string) {
    return this.prisma.webhookSubscription.create({
      data: {
        userId,
        url,
        events,
        secret: secret || crypto.randomBytes(24).toString('hex'),
      },
    })
  }

  /**
   * Lists webhooks for a user
   */
  async listWebhooks(userId: string) {
    return this.prisma.webhookSubscription.findMany({
      where: { userId },
      select: {
        id: true,
        url: true,
        events: true,
        active: true,
        createdAt: true,
      },
    })
  }

  /**
   * Deletes a webhook subscription
   */
  async deleteWebhook(userId: string, webhookId: string) {
    return this.prisma.webhookSubscription.deleteMany({
      where: { id: webhookId, userId },
    })
  }

  /**
   * Sends Expo push notifications to all user tokens
   */
  async sendPushNotification(userId: string, title: string, body: string, data?: object) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    })

    if (subscriptions.length === 0) return

    const messages = subscriptions.map(sub => ({
      to: sub.expoPushToken,
      sound: 'default',
      title,
      body,
      data: data ?? {},
    }))

    try {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(messages),
      })
    } catch {
      // Non-blocking catch for external push gateway errors
    }
  }

  /**
   * Dispatches signed webhook payloads to active user webhooks matching the event
   */
  async dispatchWebhook(userId: string, event: string, payload: object) {
    const webhooks = await this.prisma.webhookSubscription.findMany({
      where: { userId, active: true },
    })

    const matchingWebhooks = webhooks.filter(w => w.events.includes(event) || w.events.includes('*'))

    for (const hook of matchingWebhooks) {
      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        data: payload,
      })

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-PC-Remote-Event': event,
      }

      if (hook.secret) {
        const signature = crypto.createHmac('sha256', hook.secret).update(body).digest('hex')
        headers['X-PC-Remote-Signature'] = `sha256=${signature}`
      }

      fetch(hook.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(5000),
      }).catch(() => {
        // Silently capture webhook dispatch failures
      })
    }
  }

  /**
   * Helper to dispatch both push notification and webhook alert
   */
  async notifyUser(userId: string, event: string, title: string, body: string, payload: object) {
    await Promise.all([
      this.sendPushNotification(userId, title, body, { event, ...payload }),
      this.dispatchWebhook(userId, event, payload),
    ])
  }
}
