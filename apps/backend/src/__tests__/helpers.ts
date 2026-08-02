import { app } from '../app.js'

export const BASE = 'http://127.0.0.1:3000'

let serverBaseUrl: string | null = null

async function getBaseUrl(): Promise<string> {
  if (serverBaseUrl) return serverBaseUrl
  try {
    serverBaseUrl = await app.listen({ port: 0, host: '127.0.0.1' })
  } catch {
    serverBaseUrl = 'http://127.0.0.1:3000'
  }
  return serverBaseUrl
}

export async function api(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<{ status: number; body: unknown }> {
  const baseUrl = await getBaseUrl()
  const { token, headers, ...rest } = options
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      // Content-Type только если есть тело — иначе Fastify отклоняет с 400
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
    ...rest,
  })

  let body: unknown
  const text = await res.text()
  try {
    body = JSON.parse(text)
  } catch {
    body = text
  }

  return { status: res.status, body }
}

// Уникальный email для каждого запуска тестов (без конфликтов в БД)
export function uniqueEmail(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@test.local`
}

// Зарегистрировать юзера и вернуть токены
export async function registerUser(email = uniqueEmail(), password = 'Test1234') {
  const { status, body } = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (status !== 201) throw new Error(`Register failed ${status}: ${JSON.stringify(body)}`)
  return { email, password, ...(body as { accessToken: string; refreshToken: string }) }
}
