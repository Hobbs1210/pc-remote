import fp from 'fastify-plugin'
import { FastifyPluginAsync } from 'fastify'
import { PrismaClient } from '@prisma/client'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

const prismaPlugin: FastifyPluginAsync = fp(async (app) => {
  const prisma = new PrismaClient({
    log: app.log.level === 'debug'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
  })

  try {
    await prisma.$connect()
    app.log.info('Connected to PostgreSQL database via Prisma')
  } catch (err) {
    app.log.error(err, 'Failed to connect to PostgreSQL database. Verify DATABASE_URL in .env and ensure PostgreSQL is running.')
  }

  app.decorate('prisma', prisma)

  app.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
})


export default prismaPlugin