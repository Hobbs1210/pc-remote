import { FastifyPluginAsync } from 'fastify'
import { NotificationsService } from './notifications.service.js'

export const notificationRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new NotificationsService(fastify.prisma)

  // POST /api/notifications/push/subscribe — Register mobile push token
  fastify.post<{ Body: { expoPushToken: string; deviceName?: string } }>(
    '/push/subscribe',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { expoPushToken, deviceName } = request.body
      if (!expoPushToken) {
        return reply.status(400).send({ error: 'expoPushToken is required' })
      }
      const userId = request.user.userId
      const sub = await service.registerPushToken(userId, expoPushToken, deviceName)
      return reply.send({ success: true, id: sub.id })
    }
  )

  // DELETE /api/notifications/push/unsubscribe — Remove push token
  fastify.delete<{ Body: { expoPushToken: string } }>(
    '/push/unsubscribe',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { expoPushToken } = request.body
      if (!expoPushToken) {
        return reply.status(400).send({ error: 'expoPushToken is required' })
      }
      await service.unregisterPushToken(expoPushToken)
      return reply.send({ success: true })
    }
  )

  // GET /api/notifications/webhooks — List user webhooks
  fastify.get(
    '/webhooks',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const userId = request.user.userId
      const webhooks = await service.listWebhooks(userId)
      return reply.send(webhooks)
    }
  )

  // POST /api/notifications/webhooks — Create new webhook
  fastify.post<{ Body: { url: string; events: string[]; secret?: string } }>(
    '/webhooks',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { url, events, secret } = request.body
      if (!url || !Array.isArray(events) || events.length === 0) {
        return reply.status(400).send({ error: 'url and non-empty events array are required' })
      }
      const userId = request.user.userId
      const webhook = await service.createWebhook(userId, url, events, secret)
      return reply.status(201).send(webhook)
    }
  )

  // DELETE /api/notifications/webhooks/:id — Delete webhook
  fastify.delete<{ Params: { id: string } }>(
    '/webhooks/:id',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const userId = request.user.userId
      await service.deleteWebhook(userId, request.params.id)
      return reply.send({ success: true })
    }
  )
}
