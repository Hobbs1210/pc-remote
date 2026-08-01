import fp from 'fastify-plugin'
import helmet from '@fastify/helmet'
import { FastifyInstance } from 'fastify'

export default fp(async function helmetPlugin(app: FastifyInstance) {
  await app.register(helmet, {
    // Allow Socket.IO to work — it uses inline scripts for the client bundle
    contentSecurityPolicy: false,
    // HSTS: force HTTPS for 1 year (only effective behind TLS termination)
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
  })
})
