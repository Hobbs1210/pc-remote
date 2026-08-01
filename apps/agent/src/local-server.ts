import http from 'node:http'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { log as logger } from './utils/logger.js'
import { config, state, savePasswordHash, resetAgentConfig } from './utils/config.js'
import bcrypt from 'bcryptjs'
import QRCode from 'qrcode'

const PORT = 3535
let isOnline = false
let pendingLock = false
let pendingLockMessage: string | null = null
let pendingLogoff = false
type VolumeAction = 'UP' | 'DOWN' | 'MUTE'
let pendingVolume: VolumeAction | null = null
let pendingScreenshot = false
let screenshotResultCb: ((base64: string) => void) | null = null
let pendingNotification: string | null = null
let lastServerError: string | null = null

export function setOnlineStatus(online: boolean) {
  isOnline = online
  if (online) {
    lastServerError = null
  }
}

export function setServerError(message: string | null) {
  lastServerError = message
}

// Запрашивает блокировку через трей (сервис в session 0 не может вызвать LockWorkStation напрямую)
export function setPendingLock(message?: string, logoff = false) {
  pendingLock = true
  pendingLockMessage = message ?? null
  pendingLogoff = logoff
}

export function setPendingVolume(action: VolumeAction) {
  pendingVolume = action
}

export function setPendingScreenshot() {
  pendingScreenshot = true
}

export function onScreenshotResult(cb: (base64: string) => void) {
  screenshotResultCb = cb
}

export function setPendingNotification(message: string) {
  pendingNotification = message
}

function checkLocalToken(req: http.IncomingMessage): boolean {
  const token = req.headers['x-local-token']
  return typeof token === 'string' && token === state.localToken
}

async function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer) => { data += chunk.toString() })
    req.on('end', () => {
      try { resolve(JSON.parse(data) as Record<string, unknown>) } catch { resolve({}) }
    })
  })
}

export function startLocalServer() {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '127.0.0.1')

    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }

    // GET /status — Bug #22 fix: only expose internal pending state to authenticated callers
    if (req.method === 'GET' && req.url === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      const isAuthed = checkLocalToken(req)
      if (isAuthed) {
        res.end(JSON.stringify({
          online: isOnline,
          deviceId: config.deviceId,
          bound: !!state.agentToken,
          pendingLock,
          pendingLockMessage,
          pendingLogoff,
          pendingVolume,
          pendingScreenshot,
          pendingNotification,
        }))
      } else {
        // Unauthenticated: only basic info (used by QR page polling)
        res.end(JSON.stringify({
          online: isOnline,
          bound: !!state.agentToken,
        }))
      }
      return
    }

    // GET /qr — HTML-страница с QR-кодом
    if (req.method === 'GET' && req.url === '/qr') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })

      if (state.agentToken && !state.secret) {
        res.end(boundHtml())
        return
      }

      if (!state.secret) {
        res.end(waitingHtml())
        return
      }

      try {
        const bindData = JSON.stringify({ deviceId: config.deviceId, secret: state.secret })
        const svg = await QRCode.toString(bindData, { type: 'svg', width: 256 })
        res.end(qrHtml(svg, config.deviceId, state.secret))
      } catch {
        res.writeHead(500)
        res.end('QR generation failed')
      }
      return
    }

    // GET /dashboard — Local Diagnostic Web View
    if (req.method === 'GET' && (req.url === '/dashboard' || req.url === '/')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(dashboardHtml())
      return
    }

    // GET /logs — Live Agent Log File Viewer
    if (req.method === 'GET' && req.url === '/logs') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
      try {
        const logPath = path.join(os.homedir(), 'AppData', 'Roaming', 'pc-remote-agent', 'logs', 'agent.log')
        if (fs.existsSync(logPath)) {
          const content = fs.readFileSync(logPath, 'utf-8')
          res.end(content.slice(-50000))
        } else {
          res.end('Log file not found at ' + logPath)
        }
      } catch (e) {
        res.end('Error reading log file: ' + String(e))
      }
      return
    }

    // POST endpoints
    if (req.method !== 'POST') {
      res.writeHead(404)
      res.end()
      return
    }

    const body = await parseBody(req)

    // POST /setup-password — Bug #5 fix: only allow unauthenticated if no password is set yet
    if (req.url === '/setup-password') {
      const password = body['password'] as string | undefined
      if (!password) { res.writeHead(400); res.end(); return }
      // If password already exists, require localToken to change it
      if (state.passwordHash && !checkLocalToken(req)) {
        res.writeHead(403)
        res.end(JSON.stringify({ error: 'Password already set — use X-Local-Token' }))
        return
      }
      const hash = await bcrypt.hash(password, 10)
      savePasswordHash(hash)
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // POST /verify-password — без токена (трей вызывает его первым для аутентификации)
    if (req.url === '/verify-password') {
      const password = body['password'] as string | undefined
      if (!password || !state.passwordHash) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ valid: false }))
        return
      }
      const valid = await bcrypt.compare(password, state.passwordHash)
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ valid }))
      return
    }

    // Все остальные POST-эндпоинты требуют X-Local-Token
    if (!checkLocalToken(req)) { res.writeHead(403); res.end(); return }

    // POST /change-password
    if (req.url === '/change-password') {
      const password = body['password'] as string | undefined
      if (!password) { res.writeHead(400); res.end(); return }
      const hash = await bcrypt.hash(password, 10)
      savePasswordHash(hash)
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // POST /ack-notification — трей подтверждает что уведомление показано
    if (req.url === '/ack-notification') {
      pendingNotification = null
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // POST /ack-lock — трей подтверждает что блокировка выполнена
    if (req.url === '/ack-lock') {
      pendingLock = false
      pendingLockMessage = null
      pendingLogoff = false
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // POST /ack-volume — трей подтверждает что команда громкости принята
    if (req.url === '/ack-volume') {
      pendingVolume = null
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // POST /ack-screenshot — трей подтверждает начало захвата скриншота
    if (req.url === '/ack-screenshot') {
      pendingScreenshot = false
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // POST /screenshot-result — трей отправляет готовый скриншот (base64)
    if (req.url === '/screenshot-result') {
      const image = body['image'] as string | undefined
      if (image && screenshotResultCb) {
        logger.info(`screenshot-result received imageLen=${image.length} — forwarding to backend`)
        screenshotResultCb(image)
      } else {
        logger.warn(`screenshot-result: image=${!!image} cb=${!!screenshotResultCb}`)
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
      return
    }

    // POST /reset — сброс привязки, требует пароль в теле
    if (req.url === '/reset') {
      const password = body['password'] as string | undefined
      if (!password || !state.passwordHash) { res.writeHead(401); res.end(); return }
      const valid = await bcrypt.compare(password, state.passwordHash)
      if (!valid) { res.writeHead(403); res.end(); return }
      resetAgentConfig()
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true }))
      setTimeout(() => process.exit(0), 500)
      return
    }

    res.writeHead(404)
    res.end()
  })

  server.listen(PORT, '127.0.0.1', () => {
    logger.info(`Local HTTP server listening on localhost:${PORT}`)
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.warn(`Port ${PORT} already in use — local server not started`)
    } else {
      logger.error({ err }, 'Local server error')
    }
  })
}

const style = `
  body{font-family:Arial,sans-serif;background:#0f0f23;color:#fff;
    display:flex;flex-direction:column;align-items:center;
    justify-content:center;min-height:100vh;margin:0;gap:20px;padding:24px;box-sizing:border-box}
  h2{margin:0;font-size:24px}
  p{margin:0;color:#aaa;font-size:14px;text-align:center}
  .box{background:#1a1a2e;border-radius:16px;padding:24px;display:flex;
    align-items:center;justify-content:center}
  .id{font-family:monospace;font-size:12px;color:#6c63ff;background:#1a1a2e;
    padding:8px 16px;border-radius:8px;word-break:break-all;max-width:320px;text-align:center}

  @media(max-width:480px){
    body{padding:16px;gap:16px}
    h2{font-size:20px}
    .box{padding:16px}
    .box svg{width:200px;height:200px}
    .hint-box{padding:12px}
    .field-row{flex-direction:column;align-items:stretch;gap:6px}
    .copy-btn{width:100%;padding:10px}
    .grid{grid-template-columns:1fr !important;gap:8px}
    .btn{display:block;text-align:center;margin-top:8px}
  }
`

function qrHtml(svg: string, deviceId: string, secret: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PC Remote — QR</title><style>${style}
  .field-row{display:flex;align-items:center;gap:8px;width:100%;max-width:360px}
  .copy-field{font-family:monospace;font-size:12px;color:#6c63ff;background:#1a1a2e;
    padding:8px 12px;border-radius:8px;word-break:break-all;flex:1;text-align:left;border:1px solid #333}
  .copy-btn{background:#6c63ff;color:#fff;border:none;border-radius:8px;padding:8px 12px;
    cursor:pointer;font-size:12px;white-space:nowrap}
  .copy-btn:active{opacity:0.7}
  .divider{color:#555;font-size:12px;margin:4px 0}
  .hint-box{background:#1a1a2e;border:1px solid #333;border-radius:12px;padding:16px;
    max-width:360px;width:100%;text-align:left}
  .hint-box h3{margin:0 0 8px;font-size:14px;color:#aaa;font-weight:600}
  .hint-box p{margin:0;font-size:12px;color:#666;line-height:1.6}
</style></head><body>
<h2>Scan QR Code</h2>
<div class="box">${svg}</div>
<p>Open the mobile app → Devices → <strong>+</strong> → Scan QR</p>

<div style="color:#888;font-size:13px;margin:8px 0">— or enter manually —</div>

<div class="hint-box">
  <h3>📋 Manual Entry</h3>
  <p>App → Add Device → Enter Code tab</p>
</div>

<p style="font-size:12px;color:#888;margin:8px 0 4px">Device ID</p>
<div class="field-row">
  <div class="copy-field" id="did">${deviceId}</div>
  <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('did').textContent);this.textContent='✓ Copied'">Copy</button>
</div>

<p style="font-size:12px;color:#888;margin:12px 0 4px">Secret</p>
<div class="field-row">
  <div class="copy-field" id="sec">${secret}</div>
  <button class="copy-btn" onclick="navigator.clipboard.writeText(document.getElementById('sec').textContent);this.textContent='✓ Copied'">Copy</button>
</div>

<script>let _qrPoll=setInterval(()=>fetch('/status').then(r=>r.json()).then(d=>{
  if(d.bound)location.reload()
}),3000);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInterval(_qrPoll)})</script>
</body></html>`
}

function boundHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PC Remote</title><style>${style}</style></head><body>
<h2>✅ Device Paired</h2>
<p>To pair with another account, click "Reset Device Binding" in the system tray menu.</p>
</body></html>`
}

function waitingHtml() {
  const serverUrl = config.serverUrl ?? 'Not configured'
  const errDetail = lastServerError ? `<div style="background:#2a1a1a;border:1px solid #ff4d4d;color:#ff8080;padding:12px;border-radius:8px;font-size:13px;max-width:100%;width:340px;box-sizing:border-box;word-break:break-word"><strong>Connection Status:</strong> ${lastServerError}</div>` : '<p>Connecting to backend server...</p>'

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PC Remote</title><style>${style}</style></head><body>
<h2>⏳ Connecting to Server...</h2>
<p>Target Server: <strong style="color:#6c63ff">${serverUrl}</strong></p>
${errDetail}
<p style="font-size:12px;color:#888">Logs location: <code>%APPDATA%\\pc-remote-agent\\logs\\agent.log</code></p>
<script>setTimeout(()=>location.reload(),3000)</script>
</body></html>`
}

function dashboardHtml() {
  const statusBadge = isOnline ? '<span style="color:#22c55e;font-weight:bold">● Online</span>' : '<span style="color:#ef4444;font-weight:bold">○ Offline</span>'
  const boundStatus = state.agentToken ? '<span style="color:#22c55e">Paired</span>' : '<span style="color:#f59e0b">Unpaired</span>'

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PC Remote — Local Diagnostics</title><style>${style}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;max-width:440px}
  .card{background:#1a1a2e;padding:16px;border-radius:12px;text-align:left}
  .card label{font-size:11px;color:#888;display:block;margin-bottom:4px;text-transform:uppercase}
  .card val{font-size:15px;font-weight:600;color:#fff}
  .btn{display:inline-block;background:#6c63ff;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px;margin-top:12px}
</style></head><body>
<h2>🖥️ PC Remote Agent Diagnostics</h2>
<div class="grid">
  <div class="card"><label>Status</label><val>${statusBadge}</val></div>
  <div class="card"><label>Binding</label><val>${boundStatus}</val></div>
  <div class="card"><label>Device ID</label><val style="font-family:monospace;font-size:11px">${config.deviceId}</val></div>
  <div class="card"><label>Target Server</label><val style="font-size:12px;word-break:break-all">${config.serverUrl || 'None'}</val></div>
</div>
<div class="card" style="width:100%;max-width:440px;box-sizing:border-box">
  <label>Logs & System Info</label>
  <val style="font-size:12px">View live logs and execution traces in real-time.</val>
  <br/>
  <a href="/logs" class="btn" target="_blank">📄 View Live Agent Logs</a>
  <a href="/qr" class="btn" style="background:#22c55e">📱 Show Pairing QR Code</a>
</div>
<script>let _dashTimer=setTimeout(()=>location.reload(),5000);document.addEventListener('visibilitychange',()=>{if(document.hidden)clearTimeout(_dashTimer)})</script>
</body></html>`
}
