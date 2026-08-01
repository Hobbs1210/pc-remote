import fp from 'fastify-plugin'
import underPressure from '@fastify/under-pressure'
import { FastifyInstance } from 'fastify'

export default fp(async function underPressurePlugin(app: FastifyInstance) {
  await app.register(underPressure, {
    maxEventLoopDelay: 1000,    // 1 s event loop lag → 503
    maxHeapUsedBytes: 500_000_000, // 500 MB heap → 503
    maxRssBytes: 600_000_000,      // 600 MB RSS → 503
    retryAfter: 30,
    message: 'Service temporarily unavailable — server under load',
    // Expose a dedicated pressure check at /health (merged with existing)
    exposeStatusRoute: false,
  })
})
