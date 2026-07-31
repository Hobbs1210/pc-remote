import { z } from 'zod'

export const DeviceStatusSchema = z.enum([
  'online',
  'offline',
  'away',    // heartbeat давно не приходил, но не таймаут
])

export const ActiveUserSchema = z.object({
  name: z.string(),
  session: z.string(), // 'console' | 'rdp' | 'unknown' | custom
  state: z.string(),   // 'Active' | 'Disconnected'
  idle: z.string(),
  logonTime: z.string(),
})

export const DiskInfoSchema = z.object({
  mount: z.string(),
  total: z.number().int(),
  free: z.number().int(),
  used: z.number().int(),
})

export type DiskInfo = z.infer<typeof DiskInfoSchema>

export const ProcessInfoSchema = z.object({
  pid: z.number().int(),
  name: z.string(),
  cpuPercent: z.number().min(0).max(100).optional(),
  memMb: z.number().min(0).optional(),
})

export type ProcessInfo = z.infer<typeof ProcessInfoSchema>

export const ActiveWindowSchema = z.object({
  title: z.string(),
  processName: z.string(),
})

export type ActiveWindow = z.infer<typeof ActiveWindowSchema>

export const HeartbeatPayloadSchema = z.object({
  deviceId: z.string().uuid(),
  timestamp: z.string().datetime(),
  cpuPercent: z.number().min(0).max(100),
  ramPercent: z.number().min(0).max(100),
  uptime: z.number().int().min(0), // секунды
  activeUsers: z.array(ActiveUserSchema),
  agentVersion: z.string(),
  disks: z.array(DiskInfoSchema).optional(),
  topProcesses: z.array(ProcessInfoSchema).optional(),
  macAddress: z.string().optional(),
  activeWindow: ActiveWindowSchema.optional(),
  volume: z.object({ level: z.number().int().min(0).max(100), muted: z.boolean() }).optional(),
})



export type ActiveUser = z.infer<typeof ActiveUserSchema>

export type HeartbeatPayload = z.infer<typeof HeartbeatPayloadSchema>

export type DeviceStatus = z.infer<typeof DeviceStatusSchema>

export const LocalUserSchema = z.object({
  name: z.string(),
  fullName: z.string(),
  enabled: z.boolean(),
})

export const LocalUsersPayloadSchema = z.object({
  deviceId: z.string().uuid(),
  users: z.array(LocalUserSchema),
})

export type LocalUser = z.infer<typeof LocalUserSchema>
export type LocalUsersPayload = z.infer<typeof LocalUsersPayloadSchema>