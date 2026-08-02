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

export interface ProcessInfo {
  pid: number
  name: string
  cpuPercent?: number
  memMb?: number
}

export interface ActiveWindow {
  title: string
  processName: string
  pid?: number
  url?: string
  browserName?: string
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
  topProcesses?: ProcessInfo[]
  macAddress?: string | null
  activeWindow?: ActiveWindow
  volume?: { level: number; muted: boolean }
}

export interface DailyUsageData {
  date: string
  activeMinutes: number
  appUsage: Record<string, number>
}

export interface DeviceMetricData {
  cpuPercent: number
  ramPercent: number
  activeApp: string | null
  timestamp: string
}

export interface AnalyticsData {
  dailyUsages: DailyUsageData[]
  metrics: DeviceMetricData[]
  topApps: Array<{ name: string; minutes: number }>
}

interface DevicesState {
  devices: Device[]
  localUsers: Record<string, LocalUser[]>
  isLoading: boolean
  error: string | null
  fetchDevices: () => Promise<void>
  fetchLocalUsers: (deviceId: string) => Promise<void>
  sendCommand: (deviceId: string, type: string, delaySeconds?: number, pid?: number, message?: string, commandText?: string, volumePercent?: number, volumeSteps?: number) => Promise<{ delivered: boolean; command?: { id: string } }>
  showMessage: (deviceId: string, message: string) => Promise<{ delivered: boolean }>
  wakeOnLan: (deviceId: string) => Promise<{ success: boolean; macAddress: string }>
  execTerminal: (deviceId: string, commandText: string) => Promise<{ delivered: boolean; commandId?: string }>
  setVolumeLevel: (deviceId: string, volumePercent: number) => Promise<void>
  emergencyLockAll: () => Promise<{ total: number; locked: number }>
  fetchAnalytics: (deviceId: string) => Promise<AnalyticsData>
  triggerAgentUpdate: (deviceId: string) => Promise<{ version: string; downloadUrl: string; delivered: boolean }>
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
      // Quiet error
    }
  },

  sendCommand: async (deviceId, type, delaySeconds = 0, pid, message, commandText, volumePercent, volumeSteps) => {
    const { data } = await api.post<{ delivered: boolean; command?: { id: string } }>(`/devices/${deviceId}/commands`, {
      type,
      delaySeconds,
      pid,
      message,
      commandText,
      volumePercent,
      volumeSteps,
    })
    return { delivered: data.delivered, command: data.command }
  },

  showMessage: async (deviceId, message) => {
    const { data } = await api.post(`/devices/${deviceId}/commands`, {
      type: 'SHOW_MESSAGE',
      delaySeconds: 0,
      message,
    })
    return { delivered: data.delivered }
  },

  wakeOnLan: async (deviceId) => {
    const { data } = await api.post<{ success: boolean; macAddress: string }>(`/devices/${deviceId}/wol`)
    return data
  },

  execTerminal: async (deviceId, commandText) => {
    const { data } = await api.post<{ delivered: boolean; command?: { id: string } }>(`/devices/${deviceId}/commands`, {
      type: 'EXEC_TERMINAL',
      delaySeconds: 0,
      commandText,
    })
    return { delivered: data.delivered, commandId: data.command?.id }
  },

  setVolumeLevel: async (deviceId, volumePercent) => {
    await api.post(`/devices/${deviceId}/commands`, {
      type: 'SET_VOLUME',
      delaySeconds: 0,
      volumePercent,
    })
  },

  fetchAnalytics: async (deviceId) => {
    const { data } = await api.get<AnalyticsData>(`/devices/${deviceId}/analytics`)
    return data
  },

  triggerAgentUpdate: async (deviceId) => {
    const { data } = await api.post<{ version: string; downloadUrl: string; delivered: boolean }>(`/devices/${deviceId}/update`)
    return data
  },




  emergencyLockAll: async () => {
    const { data } = await api.post<{ total: number; locked: number }>('/devices/emergency-lock')
    return data
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

