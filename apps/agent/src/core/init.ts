import axios from 'axios'
import { log as logger } from '../utils/logger.js'
import { config, saveAgentToken, saveSecret } from '../utils/config.js'
import { connectToServer } from './socket.js'
import { printBindQR } from '../utils/qr.js'

import { setServerError } from '../local-server.js'

export async function registerDevice(): Promise<string | null> {
  let delay = 5_000

  while (true) {
    try {
      logger.info(`Registering device with server... deviceId=${config.deviceId}`)

      const response = await axios.post<{ deviceId: string; secret: string }>(
        `${config.serverUrl}/api/devices/init`,
        { deviceId: config.deviceId, timezone: config.timezone },
        { timeout: 10_000 }
      )

      const { secret } = response.data
      logger.info('Device registered successfully')

      setServerError(null)
      saveSecret(secret)
      printBindQR(config.deviceId, secret)

      return secret
    } catch (err) {
      // 409 — устройство уже зарегистрировано, переходим к ожиданию привязки
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        logger.info('Device already registered, waiting for bind...')
        setServerError(null)
        return null
      }

      // Сервер недоступен — ретрай с экспоненциальным backoff (5s → 10s → … → 60s)
      const msg = err instanceof Error ? err.message : String(err)
      setServerError(`Unreachable (${msg})`)
      logger.warn(`Server unreachable, retrying in ${delay / 1000}s — ${msg}`)
      await new Promise<void>(r => setTimeout(r, delay))
      delay = Math.min(delay * 2, 60_000)
    }
  }
}

export async function waitForBind(): Promise<void> {
  logger.info('Waiting for device to be bound via QR...')

  return new Promise((resolve) => {
    const poll = setInterval(async () => {
      try {
        const response = await axios.get<{ agentToken: string | null }>(
          `${config.serverUrl}/api/devices/${config.deviceId}/token`
        )

        const token = response.data.agentToken
        if (token) {
          clearInterval(poll)
          saveAgentToken(token)
          logger.info('Device bound successfully, token saved')

          // Передаём токен напрямую в connectToServer
          await connectToServer(token)
          resolve()
        }
      } catch {
        // ещё не привязан — ждём
      }
    }, 5000)
  })
}