import { FastifyPluginAsync } from 'fastify'
import { AuthService, AuthError } from './auth.service.js'
import {
  RegisterSchema,
  LoginSchema,
  RefreshSchema,
} from './auth.schema.js'

const authRoutes: FastifyPluginAsync = async (app) => {
  const authService = new AuthService(app.prisma, app)

  app.post('/register', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    const body = RegisterSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    try {
      const tokens = await authService.register(body.data)
      return reply.status(201).send(tokens)
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send({ error: err.message })
      }
      throw err
    }
  })

  app.post('/login', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = LoginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    try {
      const tokens = await authService.login(body.data)
      return reply.status(200).send(tokens)
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send({ error: err.message })
      }
      throw err
    }
  })

  app.post('/refresh', async (request, reply) => {
    const body = RefreshSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    try {
      const tokens = await authService.refresh(body.data.refreshToken)
      return reply.status(200).send(tokens)
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send({ error: err.message })
      }
      throw err
    }
  })

  // Защищённый роут — требует валидный access токен
  app.post(
    '/logout',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = RefreshSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() })
      }

      await authService.logout(body.data.refreshToken)
      return reply.status(204).send()
    }
  )

  app.post(
    '/logout-all',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      await authService.logoutAll(request.user.userId)
      return reply.status(204).send()
    }
  )
}

export default authRoutes