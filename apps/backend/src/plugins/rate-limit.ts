import fp from 'fastify-plugin'
import rateLimit from '@fastify/rate-limit'
import { FastifyInstance } from 'fastify'

const rateLimitPlugin = fp(async function (app: FastifyInstance) {
  await app.register(rateLimit, {
    // Global default: 100 requests per minute per IP
    max: 100,
    timeWindow: '1 minute',
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

export default rateLimitPlugin
