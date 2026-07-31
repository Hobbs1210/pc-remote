import 'dotenv/config'
import Fastify from 'fastify'
import prismaPlugin from './plugins/prisma.js'
import jwtPlugin from './plugins/jwt.js'
import socketPlugin from './plugins/socket.js'
import authRoutes from './modules/auth/auth.routes.js'
import {
  devicesPublicRoutes,
  devicesPrivateRoutes,
} from './modules/devices/devices.routes.js'

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? 'info',
    ...(process.env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty' } }
      : {}),
  },
})
await app.register(prismaPlugin)
await app.register(jwtPlugin)
await app.register(socketPlugin)

await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(devicesPublicRoutes, { prefix: '/api/devices' })
await app.register(devicesPrivateRoutes, { prefix: '/api/devices' })

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dashboardHtmlPath = path.join(__dirname, 'views', 'dashboard.html')
let dashboardHtmlCache: string | null = null

function getDashboardHtml(): string {
  if (!dashboardHtmlCache || process.env.NODE_ENV === 'development') {
    dashboardHtmlCache = fs.readFileSync(dashboardHtmlPath, 'utf-8')
  }
  return dashboardHtmlCache
}

app.get('/', async (req, reply) => {
  const accept = req.headers.accept ?? ''
  if (accept.includes('text/html')) {
    reply.type('text/html').send(getDashboardHtml())
    return
  }

  return {
    name: 'PC Remote Backend API',
    status: 'ok',
    version: '0.0.2',
    health: '/health',
  }
})


app.get('/health', async () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
}))


const start = async () => {
  try {
    await app.listen({
      port: Number(process.env.PORT ?? 3000),
      host: '0.0.0.0',
    })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

const shutdown = async (signal: string) => {
  app.log.info(`Received ${signal}, shutting down gracefully`)
  await app.close()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

void start()