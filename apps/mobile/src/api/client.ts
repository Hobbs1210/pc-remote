import axios from 'axios'
import { storage } from '../utils/storage'

const getEnvServerUrl = (): string | undefined => {
  if (typeof window !== 'undefined' && (window as any).__ENV__?.SERVER_URL) {
    const windowUrl = (window as any).__ENV__.SERVER_URL
    if (windowUrl && windowUrl.trim() && !windowUrl.includes('__SERVER_URL__')) {
      return windowUrl.trim().replace(/\/+$/, '')
    }
  }
  if (typeof process !== 'undefined' && process.env) {
    const envUrl =
      process.env.EXPO_PUBLIC_SERVER_URL ||
      process.env.SERVER_URL ||
      process.env.REACT_APP_SERVER_URL
    if (envUrl && envUrl.trim()) {
      return envUrl.trim().replace(/\/+$/, '')
    }
  }
  return undefined
}

export const DEFAULT_API_URL =
  getEnvServerUrl() || 'https://pc-remote-backend.onrender.com'
const SERVER_URL_KEY = 'serverUrl'

export let API_URL = DEFAULT_API_URL

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

/** Загружает сохранённый URL при старте приложения */
export async function loadServerUrl() {
  const stored = await storage.getItem(SERVER_URL_KEY)
  if (stored) {
    API_URL = stored
    api.defaults.baseURL = `${stored}/api`
  } else {
    API_URL = DEFAULT_API_URL
    api.defaults.baseURL = `${DEFAULT_API_URL}/api`
  }
}

/** Сохраняет новый URL и обновляет axios */
export async function setServerUrl(url: string) {
  const clean = url.trim().replace(/\/+$/, '')
  await storage.setItem(SERVER_URL_KEY, clean)
  API_URL = clean
  api.defaults.baseURL = `${clean}/api`
}

api.interceptors.request.use(async (config) => {
  const token = await storage.getItem('accessToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refreshToken = await storage.getItem('refreshToken')
        if (!refreshToken) throw new Error('No refresh token')
        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, {
          refreshToken,
        })
        await storage.setItem('accessToken', data.accessToken)
        await storage.setItem('refreshToken', data.refreshToken)
        original.headers.Authorization = `Bearer ${data.accessToken}`
        return api(original)
      } catch {
        // Bug #11 fix: clear tokens AND set isAuthenticated = false
        await storage.deleteItem('accessToken')
        await storage.deleteItem('refreshToken')
        // Dynamically import to avoid circular deps, then force logout state
        const { useAuthStore } = await import('../store/auth')
        useAuthStore.setState({ isAuthenticated: false })
      }
    }
    return Promise.reject(error)
  }
)
