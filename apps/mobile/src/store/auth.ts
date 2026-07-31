import { create } from 'zustand'
import { storage } from '../utils/storage'
import { api } from '../api/client'

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
    const { data } = await api.post('/auth/login', { email, password })
    await storage.setItem('accessToken', data.accessToken)
    await storage.setItem('refreshToken', data.refreshToken)
    set({ isAuthenticated: true })
  },

  register: async (email, password) => {
    const { data } = await api.post('/auth/register', { email, password })
    await storage.setItem('accessToken', data.accessToken)
    await storage.setItem('refreshToken', data.refreshToken)
    set({ isAuthenticated: true })
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

