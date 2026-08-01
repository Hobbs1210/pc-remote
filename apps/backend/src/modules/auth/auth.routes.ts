import { FastifyPluginAsync } from 'fastify'
import { AuthService, AuthError } from './auth.service.js'
import { RegisterSchema, LoginSchema, RefreshSchema } from './auth.schema.js'

const authRoutes: FastifyPluginAsync = async (app) => {
  const service = new AuthService(app.prisma, app)

  app.post('/register', async (request, reply) => {
    const body = RegisterSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    try {
      const result = await service.register(body.data)
      return reply.status(201).send(result)
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
      }
      throw err
    }
  })

  app.post('/login', async (request, reply) => {
    const body = LoginSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    try {
      const result = await service.login(body.data)
      return reply.send(result)
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
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
      const result = await service.refresh(body.data.refreshToken)
      return reply.send(result)
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
      }
      throw err
    }
  })

  app.post('/logout', { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = RefreshSchema.safeParse(request.body)
    if (body.success) {
      await service.logout(body.data.refreshToken)
    }
    return reply.status(204).send()
  })

  app.post('/logout-all', { preHandler: [app.authenticate] }, async (request, reply) => {
    await service.logoutAll(request.user.userId)
    return reply.status(204).send()
  })
}

export default authRoutes
