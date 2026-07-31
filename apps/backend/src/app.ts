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

app.get('/', async (req, reply) => {
  const accept = req.headers.accept ?? ''
  if (accept.includes('text/html')) {
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PC Remote — Admin Web Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0b0b18; color: #e2e8f0; font-family: 'Inter', sans-serif; min-height: 100vh; padding: 32px 24px; }
    .container { max-width: 1000px; margin: 0 auto; }
    header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid #1e1e38; }
    .logo-box { display: flex; align-items: center; gap: 14px; }
    .logo-icon { width: 44px; height: 44px; background: linear-gradient(135deg, #6c63ff, #3b82f6); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 22px; }
    h1 { font-size: 24px; font-weight: 700; color: #fff; }
    .subtitle { color: #94a3b8; font-size: 13px; margin-top: 2px; }
    .badge { background: rgba(74, 222, 128, 0.15); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
    .badge-dot { width: 8px; height: 8px; background: #4ade80; border-radius: 50%; box-shadow: 0 0 8px #4ade80; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 32px; }
    .card { background: #14142b; border: 1px solid #232342; border-radius: 16px; padding: 24px; transition: transform 0.2s, border-color 0.2s; }
    .card:hover { border-color: #6c63ff; transform: translateY(-2px); }
    .card-title { color: #94a3b8; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .card-value { font-size: 28px; font-weight: 700; color: #fff; }
    .card-desc { color: #64748b; font-size: 13px; margin-top: 6px; }
    .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .section-title { font-size: 18px; font-weight: 700; color: #fff; }
    code { font-family: 'JetBrains Mono', monospace; background: #1e1e38; padding: 3px 8px; border-radius: 6px; font-size: 13px; color: #38bdf8; }
    table { width: 100%; border-collapse: collapse; background: #14142b; border-radius: 16px; overflow: hidden; border: 1px solid #232342; }
    th, td { padding: 14px 20px; text-align: left; border-bottom: 1px solid #1e1e38; font-size: 14px; }
    th { background: #1a1a36; color: #94a3b8; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
    tr:last-child td { border-bottom: none; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo-box">
        <div class="logo-icon">💻</div>
        <div>
          <h1>PC Remote API Server</h1>
          <div class="subtitle">v0.0.2 · Fastify & Socket.io Engine</div>
        </div>
      </div>
      <div class="badge">
        <div class="badge-dot"></div> Server Online
      </div>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">Backend Status</div>
        <div class="card-value">Running</div>
        <div class="card-desc">Port: <code>3000</code></div>
      </div>
      <div class="card">
        <div class="card-title">Database Studio</div>
        <div class="card-value">Prisma GUI</div>
        <div class="card-desc">Launch with <code>pnpm --filter backend db:studio</code></div>
      </div>
      <div class="card">
        <div class="card-title">Mobile App & Agent</div>
        <div class="card-value">Connected</div>
        <div class="card-desc">WebSocket signaling active</div>
      </div>
    </div>

    <div class="section-header">
      <div class="section-title">Available API Services</div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Endpoint</th>
          <th>Method</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><code>/health</code></td>
          <td>GET</td>
          <td>Server health monitor</td>
        </tr>
        <tr>
          <td><code>/api/auth/login</code></td>
          <td>POST</td>
          <td>User authentication</td>
        </tr>
        <tr>
          <td><code>/api/devices</code></td>
          <td>GET</td>
          <td>List registered PC devices</td>
        </tr>
        <tr>
          <td><code>/api/devices/:id/commands</code></td>
          <td>POST</td>
          <td>Dispatch remote commands (Shutdown, Lock, Terminal, Volume, Banner)</td>
        </tr>
        <tr>
          <td><code>/api/devices/:id/wol</code></td>
          <td>POST</td>
          <td>Send Wake-on-LAN magic packet</td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`)
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