import fp from 'fastify-plugin'
import underPressure from '@fastify/under-pressure'
import { FastifyInstance } from 'fastify'

const underPressurePlugin = fp(async function (app: FastifyInstance) {
  await app.register(underPressure, {
    maxEventLoopDelay: 1000,       // 1s event loop lag → 503
    maxHeapUsedBytes: 500_000_000, // 500 MB heap → 503
    maxRssBytes: 600_000_000,      // 600 MB RSS → 503
    retryAfter: 30,
    message: 'Service temporarily unavailable — server under load',
    exposeStatusRoute: false,
  })
})

export default underPressurePlugin
