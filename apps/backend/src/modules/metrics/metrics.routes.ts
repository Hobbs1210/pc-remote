import { FastifyPluginAsync } from 'fastify'
import { MetricsService } from './metrics.service.js'

export const metricsPrivateRoutes: FastifyPluginAsync = async (fastify) => {
  const service = new MetricsService(fastify.prisma)

  // POST /api/devices/:id/metrics/prune — Manual metrics retention trigger
  fastify.post<{ Params: { id: string }; Body: { retentionDays?: number } }>(
    '/:id/metrics/prune',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const { retentionDays = 30 } = request.body ?? {}
      const result = await service.pruneMetrics(retentionDays)
      return reply.send({ success: true, prunedCount: result.count, retentionDays })
    }
  )

  // GET /api/devices/:id/metrics/summary — Aggregated metrics history
  fastify.get<{ Params: { id: string }; Querystring: { days?: string } }>(
    '/:id/metrics/summary',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const days = Number(request.query.days ?? 7)
      const summary = await service.getMetricsSummary(request.params.id, days)
      return reply.send(summary)
    }
  )
}
