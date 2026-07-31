import fp from 'fastify-plugin'
import { FastifyPluginAsync, FastifyRequest, FastifyReply, FastifyInstance } from 'fastify'
import fjwt from '@fastify/jwt'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email: string }
    user: { userId: string; email: string }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>
    jwt: any
  }
  interface FastifyRequest {
    jwtVerify: (options?: any) => Promise<any>
    user: { userId: string; email: string }
  }
}

const jwtPlugin: FastifyPluginAsync = fp(async (app: FastifyInstance) => {
  await app.register(fjwt, {
    secret: process.env.JWT_SECRET!,
    sign: { expiresIn: '15m' }, // access токен живёт 15 минут
  })

  // Декоратор — вешаем на request для защищённых роутов
  app.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify()
      } catch {
        reply.status(401).send({ error: 'Unauthorized' })
      }
    }
  )
})

export default jwtPlugin