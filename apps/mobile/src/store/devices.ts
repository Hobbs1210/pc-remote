import { create } from 'zustand'
import { api } from '../api/client'

export interface DiskInfo {
  mount: string
  total: number
  free: number
  used: number
}

export interface ActiveUser {
  name: string
  session: string   // 'console' | 'rdp' | 'unknown'
  state: string     // 'Active' | 'Disconnected'
  idle: string
  logonTime: string
}

export interface LocalUser {
  id: string
  deviceId: string
  name: string
  fullName: string
  enabled: boolean
}

export interface Device {
  id: string
  name: string
  status: 'online' | 'offline' | 'away'
  lastSeenAt: string | null
  cpuPercent: number | null
  ramPercent: number | null
  uptime: number | null
  activeUsers: ActiveUser[]
  agentVersion: string | null
  timezone: string
  disks: DiskInfo[]
}

interface DevicesState {
  devices: Device[]
  localUsers: Record<string, LocalUser[]>
  isLoading: boolean
  error: string | null
  fetchDevices: () => Promise<void>
  fetchLocalUsers: (deviceId: string) => Promise<void>
  sendCommand: (deviceId: string, type: string, delaySeconds?: number) => Promise<{ delivered: boolean }>
  fetchScreenshot: (deviceId: string) => Promise<{ image: string; capturedAt: string } | null>
  bindDevice: (deviceId: string, secret: string, name: string) => Promise<void>
  deleteDevice: (deviceId: string) => Promise<void>
}

export const useDevicesStore = create<DevicesState>((set) => ({
  devices: [],
  localUsers: {},
  isLoading: false,
  error: null,

  fetchDevices: async () => {
    set({ isLoading: true, error: null })
    try {
      const { data } = await api.get<Device[]>('/devices')
      set({ devices: data, isLoading: false })
    } catch {
      set({ error: 'Failed to load devices', isLoading: false })
    }

  },

  fetchLocalUsers: async (deviceId) => {
    try {
      const { data } = await api.get<LocalUser[]>(`/devices/${deviceId}/users`)
      set((s) => ({ localUsers: { ...s.localUsers, [deviceId]: data } }))
    } catch {
      // Тихая ошибка — список просто останется пустым
    }
  },

  sendCommand: async (deviceId, type, delaySeconds = 0) => {
    const { data } = await api.post(`/devices/${deviceId}/commands`, { type, delaySeconds })
    return { delivered: data.delivered }
  },

  fetchScreenshot: async (deviceId) => {
    try {
      const { data } = await api.get<{ image: string; capturedAt: string }>(`/devices/${deviceId}/screenshot`)
      return data
    } catch {
      return null
    }
  },

  bindDevice: async (deviceId, secret, name) => {
    await api.post('/devices/bind', {
      deviceId,
      secret,
      name,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    const { data } = await api.get<Device[]>('/devices')
    set({ devices: data })
  },

  deleteDevice: async (deviceId) => {
    await api.delete(`/devices/${deviceId}`)
    set((s) => ({ devices: s.devices.filter((d) => d.id !== deviceId) }))
  },
}))
