import { FastifyInstance } from 'fastify'

export async function queueRoutes(app: FastifyInstance) {
  // Require JWT auth for queue management
  app.addHook('onRequest', app.authenticate)

  // 1. GET /api/queue/health — Queue status & health
  app.get('/health', async (req, reply) => {
    const failedJobs = await app.queue.getFailedJobs()
    return reply.send({
      status: 'ok',
      driver: process.env.QUEUE_DRIVER ?? (process.env.REDIS_URL ? 'bullmq' : 'memory'),
      failedJobCount: failedJobs.length,
      timestamp: new Date().toISOString(),
    })
  })

  // 2. GET /api/queue/failed — List Dead-Letter Queue (DLQ) failed jobs
  app.get('/failed', async (req, reply) => {
    const failedJobs = await app.queue.getFailedJobs()
    return reply.send({ count: failedJobs.length, failedJobs })
  })

  // 3. POST /api/queue/failed/:id/retry — Retry a failed job from DLQ
  app.post<{ Params: { id: string } }>('/failed/:id/retry', async (req, reply) => {
    const retried = await app.queue.retryFailedJob(req.params.id)
    if (!retried) {
      return reply.status(404).send({ error: 'Failed job not found' })
    }
    return reply.send({ success: true, message: 'Job requeued for retry' })
  })

  // 4. DELETE /api/queue/failed — Clear all DLQ jobs
  app.delete('/failed', async (req, reply) => {
    await app.queue.clearFailedJobs()
    return reply.send({ success: true, message: 'Dead-Letter Queue cleared' })
  })
}
