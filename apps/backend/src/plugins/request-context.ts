import fp from 'fastify-plugin'
import requestContext from '@fastify/request-context'
import { FastifyInstance } from 'fastify'

declare module '@fastify/request-context' {
  interface RequestContextData {
    requestId: string
    userId?: string
  }
}

export default fp(async function requestContextPlugin(app: FastifyInstance) {
  await app.register(requestContext)

  // Attach the Fastify request ID into context on every request
  app.addHook('onRequest', (request, _reply, done) => {
    requestContext.set('requestId', request.id as string)
    done()
  })
})
