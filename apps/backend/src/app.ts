import 'dotenv/config'
import Fastify from 'fastify'
import prismaPlugin from './plugins/prisma.js'
import jwtPlugin from './plugins/jwt.js'
import corsPlugin from './plugins/cors.js'
import helmetPlugin from './plugins/helmet.js'
import rateLimitPlugin from './plugins/rate-limit.js'
import compressPlugin from './plugins/compress.js'
import sensiblePlugin from './plugins/sensible.js'
import underPressurePlugin from './plugins/under-pressure.js'
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
await app.register(corsPlugin)
await app.register(helmetPlugin)
await app.register(rateLimitPlugin)
await app.register(compressPlugin)
await app.register(sensiblePlugin)
await app.register(underPressurePlugin)
await app.register(socketPlugin)

import { metricsPrivateRoutes } from './modules/metrics/metrics.routes.js'
import { notificationRoutes } from './modules/notifications/notifications.routes.js'
import { MetricsService } from './modules/metrics/metrics.service.js'

await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(devicesPublicRoutes, { prefix: '/api/devices' })
await app.register(devicesPrivateRoutes, { prefix: '/api/devices' })
await app.register(metricsPrivateRoutes, { prefix: '/api/devices' })
await app.register(notificationRoutes, { prefix: '/api/notifications' })

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let dashboardHtmlCache: string | null = null

function getDashboardHtml(): string {
  if (!dashboardHtmlCache || process.env.NODE_ENV === 'development') {
    const candidatePaths = [
      path.join(__dirname, 'views', 'dashboard.html'),
      path.join(__dirname, '..', 'src', 'views', 'dashboard.html'),
      path.join(__dirname, '..', 'views', 'dashboard.html'),
    ]

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        dashboardHtmlCache = fs.readFileSync(p, 'utf-8')
        break
      }
    }
  }
  return dashboardHtmlCache ?? '<html><body><h1>PC Remote API Server</h1><p>Server online</p></body></html>'
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

    // Schedule daily metrics retention pruning (keep last 30 days)
    const metricsService = new MetricsService(app.prisma)
    metricsService.pruneMetrics(30).catch(err => app.log.warn({ err }, 'Initial metrics pruning error'))
    setInterval(() => {
      metricsService.pruneMetrics(30).catch(err => app.log.warn({ err }, 'Daily metrics pruning error'))
    }, 24 * 60 * 60 * 1000)
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