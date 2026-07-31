import 'dotenv/config'
import { z } from 'zod'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const ConfigSchema = z.object({
  // optional — позволяет загрузить модуль без SERVER_URL (--set-password, --reset из инсталлера)
  // Явная проверка наличия делается в main() перед подключением
  SERVER_URL: z.string().url().optional(),
  DEVICE_ID: z.string().uuid().optional(),
  AGENT_TOKEN: z.string().optional(),
  TIMEZONE: z.string().default(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  ),
})

// Путь к файлу конфига агента
// pkg упаковывает агент в .exe и выставляет process.pkg — надёжный способ определить production.
// NODE_ENV нельзя использовать: инсталлер запускает agent.exe без NODE_ENV,
// поэтому хеш пароля попадал бы в .agent-config.json вместо ProgramData.
const isPackaged = typeof (process as unknown as Record<string, unknown>)['pkg'] !== 'undefined'
const CONFIG_PATH = isPackaged
  ? path.join(process.env.PROGRAMDATA ?? 'C:\\ProgramData', 'pc-remote-agent', 'config.json')
  : path.join(process.cwd(), '.agent-config.json')

interface AgentConfig {
  deviceId: string
  agentToken?: string
  secret?: string   // хранится до привязки, затем удаляется
  timezone: string
  passwordHash?: string
  localToken?: string  // shared secret для связи агент ↔ трей
}

// Загружаем или создаём конфиг агента
function loadOrCreateAgentConfig(): AgentConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
      return JSON.parse(raw) as AgentConfig
    }
  } catch {
    // файл повреждён — создаём новый
  }

  // Первый запуск — генерируем deviceId и localToken
  const config: AgentConfig = {
    deviceId: crypto.randomUUID(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    localToken: crypto.randomBytes(32).toString('hex'),
  }

  // Создаём директорию если не существует
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))

  return config
}

function writeConfig(cfg: AgentConfig) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

export function saveSecret(secret: string) {
  const cfg = loadOrCreateAgentConfig()
  cfg.secret = secret
  writeConfig(cfg)
  state.secret = secret
}

export function saveAgentToken(token: string) {
  const cfg = loadOrCreateAgentConfig()
  cfg.agentToken = token
  delete cfg.secret
  writeConfig(cfg)
  state.agentToken = token
  state.secret = undefined
}

export function savePasswordHash(hash: string) {
  const cfg = loadOrCreateAgentConfig()
  cfg.passwordHash = hash
  writeConfig(cfg)
  state.passwordHash = hash
}

export function resetAgentConfig() {
  const newCfg: AgentConfig = {
    deviceId: crypto.randomUUID(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newCfg, null, 2))
  return newCfg
}

const env = ConfigSchema.parse(process.env)
const agentConfig = loadOrCreateAgentConfig()

export const config = {
  serverUrl: (env.SERVER_URL ?? '').replace(/\/+$/, ''),
  deviceId: agentConfig.deviceId,
  agentToken: agentConfig.agentToken,
  secret: agentConfig.secret,
  timezone: agentConfig.timezone,
  passwordHash: agentConfig.passwordHash,
  localToken: agentConfig.localToken,
} as const

// Изменяемое состояние — обновляется при сохранении
export const state = {
  secret: agentConfig.secret as string | undefined,
  agentToken: agentConfig.agentToken as string | undefined,
  passwordHash: agentConfig.passwordHash as string | undefined,
  localToken: agentConfig.localToken as string | undefined,
}