import { FastifyPluginAsync } from 'fastify'
import { DevicesService, DeviceError } from './devices.service.js'
import {
  BindDeviceSchema,
  SendCommandSchema,
  UpdateScheduleSchema,
  BonusTimeSchema,
} from './devices.schema.js'

// Публичные роуты (без аутентификации)
const devicesPublicRoutes: FastifyPluginAsync = async (app) => {
  const service = new DevicesService(app.prisma, app)

  // Bug #6 fix: require secret query param to prevent unauthenticated token leakage
  app.get<{ Params: { id: string }; Querystring: { secret?: string } }>('/:id/token', async (request, reply) => {
    const secret = request.query.secret
    if (!secret) {
      return reply.status(400).send({ error: 'secret query parameter required' })
    }
    try {
      const result = await service.getAgentToken(request.params.id, secret)
      return reply.send(result)
    } catch (err) {
      if (err instanceof DeviceError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
      }
      throw err
    }
  })

  app.post('/init', async (request, reply) => {
    const body = request.body as Record<string, unknown>
    const deviceId = body['deviceId'] as string | undefined
    const timezone = (body['timezone'] as string | undefined) ?? 'UTC'

    if (!deviceId) {
      return reply.status(400).send({ error: 'deviceId required' })
    }

    try {
      const result = await service.initDevice(deviceId, timezone)
      return reply.status(201).send(result)
    } catch (err) {
      if (err instanceof DeviceError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
      }
      throw err
    }
  })
}

// Защищённые роуты (требуют JWT)
const devicesPrivateRoutes: FastifyPluginAsync = async (app) => {
  const service = new DevicesService(app.prisma, app)

  app.addHook('preHandler', app.authenticate)

  app.get('/', async (request) => {
    return service.getUserDevices(request.user.userId)
  })

  app.post('/emergency-lock', async (request, reply) => {
    try {
      const result = await service.emergencyLockAll(request.user.userId)
      return reply.status(200).send(result)
    } catch (err) {
      if (err instanceof DeviceError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
      }
      throw err
    }
  })


  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      return await service.getDevice(request.user.userId, request.params.id)
    } catch (err) {
      if (err instanceof DeviceError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
      }
      throw err
    }
  })

  // Локальные пользователи Windows на устройстве
  app.get<{ Params: { id: string } }>('/:id/users', async (request, reply) => {
    try {
      const users = await service.getDeviceUsers(request.user.userId, request.params.id)
      return reply.send(users)
    } catch (err) {
      if (err instanceof DeviceError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
      }
      throw err
    }
  })

  // История команд устройства
  app.get<{ Params: { id: string } }>(
    '/:id/commands',
    async (request, reply) => {
      try {
        const commands = await service.getCommandHistory(request.user.userId, request.params.id)
        return reply.send(commands)
      } catch (err) {
        if (err instanceof DeviceError) {
          return reply.status(err.statusCode).send({ error: err.message, code: err.code })
        }
        throw err
      }
    }
  )

  // Analytics & usage statistics
  app.get<{ Params: { id: string } }>('/:id/analytics', async (request, reply) => {
    try {
      const analytics = await service.getAnalytics(request.user.userId, request.params.id)
      return reply.send(analytics)
    } catch (err) {
      if (err instanceof DeviceError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
      }
      throw err
    }
  })

  // Get installed software inventory
  app.get<{ Params: { id: string } }>('/:id/apps', async (request, reply) => {
    try {
      const device = await service.getDevice(request.user.userId, request.params.id)
      return reply.send({ apps: device.installedApps ?? [] })
    } catch (err) {
      if (err instanceof DeviceError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
      }
      throw err
    }
  })

  // Trigger automatic agent update
  app.post<{ Params: { id: string }; Body: { downloadUrl?: string; version?: string } }>(
    '/:id/update',
    async (request, reply) => {
      try {
        const { downloadUrl, version } = request.body ?? {}
        const result = await service.triggerAgentUpdate(request.user.userId, request.params.id, downloadUrl, version)
        return reply.send(result)
      } catch (err) {
        if (err instanceof DeviceError) {
          return reply.status(err.statusCode).send({ error: err.message, code: err.code })
        }
        throw err
      }
    }
  )


  app.post('/bind', async (request, reply) => {
    const body = BindDeviceSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    try {
      const result = await service.bindDevice(request.user.userId, body.data)
      return reply.status(201).send(result)
    } catch (err) {
      if (err instanceof DeviceError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
      }
      throw err
    }
  })

  app.post<{ Params: { id: string } }>(
    '/:id/commands',
    async (request, reply) => {
      const body = SendCommandSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() })
      }

      try {
        const result = await service.sendCommand(
          request.user.userId,
          request.params.id,
          body.data
        )
        return reply.status(202).send(result)
      } catch (err) {
        if (err instanceof DeviceError) {
          return reply.status(err.statusCode).send({ error: err.message, code: err.code })
        }
        throw err
      }
    }
  )

  app.put<{ Params: { id: string } }>(
    '/:id/schedule',
    async (request, reply) => {
      const body = UpdateScheduleSchema.safeParse(request.body)
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() })
      }

      try {
        const schedule = await service.updateSchedule(
          request.user.userId,
          request.params.id,
          body.data
        )
        return reply.status(200).send(schedule)
      } catch (err) {
        if (err instanceof DeviceError) {
          return reply.status(err.statusCode).send({ error: err.message, code: err.code })
        }
        throw err
      }
    }
  )

  app.get<{ Params: { id: string } }>('/:id/screenshot', async (request, reply) => {
    // Сначала быстрый in-memory кэш
    const cached = app.getDeviceScreenshot(request.params.id)
    if (cached) {
      return reply.send(cached)
    }
    // Фолбэк: читаем из БД (переживает перезапуск Render)
    const device = await app.prisma.device.findFirst({
      where: { id: request.params.id, userId: request.user.userId },
      select: { screenshotImage: true, screenshotAt: true },
    })
    if (!device) {
      return reply.status(404).send({ error: 'Device not found' })
    }
    if (!device.screenshotImage || !device.screenshotAt) {
      return reply.status(404).send({ error: 'No screenshot available' })
    }
    return reply.send({
      image: device.screenshotImage,
      capturedAt: device.screenshotAt.toISOString(),
    })
  })

  app.post<{ Params: { id: string } }>('/:id/wol', async (request, reply) => {
    try {
      const result = await service.wakeOnLan(request.user.userId, request.params.id)
      return reply.status(200).send(result)
    } catch (err) {
      if (err instanceof DeviceError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
      }
      throw err
    }
  })

  app.post<{ Params: { id: string } }>('/:id/schedule/bonus', async (request, reply) => {

    const body = BonusTimeSchema.safeParse(request.body)
    if (!body.success) {
      return reply.status(400).send({ error: body.error.flatten() })
    }

    try {
      const result = await service.addBonusTime(
        request.user.userId,
        request.params.id,
        body.data
      )
      return reply.status(200).send(result)
    } catch (err) {
      if (err instanceof DeviceError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
      }
      throw err
    }
  })

  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    try {
      await service.deleteDevice(request.user.userId, request.params.id)
      return reply.status(204).send()
    } catch (err) {
      if (err instanceof DeviceError) {
        return reply.status(err.statusCode).send({ error: err.message, code: err.code })
      }
      throw err
    }
  })
}

// Экспортируем оба — регистрируем раздельно в app.ts
export { devicesPublicRoutes, devicesPrivateRoutes }