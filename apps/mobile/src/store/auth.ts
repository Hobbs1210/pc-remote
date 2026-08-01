import { create } from 'zustand'
import { storage } from '../utils/storage'
import { api } from '../api/client'
import axios from 'axios'

/** Pulls a human-readable message out of a Zod / AuthError API response */
function extractApiError(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as Record<string, unknown> | undefined
    if (data) {
      // Zod field errors: { error: { fieldErrors: { password: ['...'] } } }
      const fieldErrors = (data.error as Record<string, unknown>)?.fieldErrors as
        | Record<string, string[]>
        | undefined
      if (fieldErrors) {
        const messages = Object.values(fieldErrors).flat()
        if (messages.length) return messages.join('\n')
      }
      // AuthError: { error: 'Invalid credentials' }
      if (typeof data.error === 'string') return data.error
    }
  }
  return 'An unexpected error occurred'
}

interface AuthState {
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,

  checkAuth: async () => {
    const token = await storage.getItem('accessToken')
    set({ isAuthenticated: !!token, isLoading: false })
  },

  login: async (email, password) => {
    try {
      const { data } = await api.post('/auth/login', { email, password })
      await storage.setItem('accessToken', data.accessToken)
      await storage.setItem('refreshToken', data.refreshToken)
      set({ isAuthenticated: true })
    } catch (err) {
      throw new Error(extractApiError(err))
    }
  },

  register: async (email, password) => {
    try {
      const { data } = await api.post('/auth/register', { email, password })
      await storage.setItem('accessToken', data.accessToken)
      await storage.setItem('refreshToken', data.refreshToken)
      set({ isAuthenticated: true })
    } catch (err) {
      throw new Error(extractApiError(err))
    }
  },

  logout: async () => {
    const refreshToken = await storage.getItem('refreshToken')
    if (refreshToken) {
      await api.post('/auth/logout', { refreshToken }).catch(() => {})
    }
    await storage.deleteItem('accessToken')
    await storage.deleteItem('refreshToken')
    set({ isAuthenticated: false })
  },
}))

