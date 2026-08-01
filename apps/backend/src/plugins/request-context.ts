import fp from 'fastify-plugin'
import { fastifyRequestContext } from '@fastify/request-context'
import { FastifyInstance } from 'fastify'

declare module '@fastify/request-context' {
  interface RequestContextData {
    requestId: string
    userId?: string
  }
}

const requestContextPlugin = fp(async function (app: FastifyInstance) {
  await app.register(fastifyRequestContext)

  // Attach the Fastify request ID into context on every request
  app.addHook('onRequest', (request, _reply, done) => {
    request.requestContext.set('requestId', request.id as string)
    done()
  })
})

export default requestContextPlugin
