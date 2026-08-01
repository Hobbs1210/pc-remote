import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'
import { FastifyInstance } from 'fastify'

export default fp(async function rateLimitPlugin(app: FastifyInstance) {
  await app.register(rateLimit, {
    // Global default: 100 requests per minute per IP
    max: 100,
    timeWindow: '1 minute',
    // Auth endpoints get a much stricter limit applied per-route (see auth.routes.ts)
    keyGenerator: (request) =>
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      request.ip,
    errorResponseBuilder: (_request, context) => ({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Retry in ${context.after}`,
      statusCode: 429,
    }),
  })
})
