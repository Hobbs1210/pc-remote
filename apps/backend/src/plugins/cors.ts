import fastifyCors from '@fastify/cors'
import fastifyPlugin from 'fastify-plugin'
import { FastifyInstance } from 'fastify'

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export default fastifyPlugin(async function corsPlugin(app: FastifyInstance) {
  await app.register(fastifyCors, {
    // In development allow all origins; in production restrict to explicit list
    origin:
      process.env.NODE_ENV === 'development' || ALLOWED_ORIGINS.length === 0
        ? true
        : ALLOWED_ORIGINS,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
})
