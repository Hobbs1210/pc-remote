import { z } from 'zod'

export const CommandTypeSchema = z.enum([
  'SHUTDOWN',
  'REBOOT',
  'LOCK',
  'SLEEP',
  'VOLUME_UP',
  'VOLUME_DOWN',
  'VOLUME_MUTE',
  'SCREENSHOT',
  'KILL_PROCESS',
  'WOL',
  'SHOW_MESSAGE',
  'EXEC_TERMINAL',
  'SET_VOLUME',
  'UPDATE_AGENT',
])

export type CommandType = z.infer<typeof CommandTypeSchema>

export const CommandPayloadSchema = z.object({
  type: CommandTypeSchema,
  delaySeconds: z.number().int().min(0).max(3600).default(0),
  message: z.string().max(2000).optional(),
  pid: z.number().int().optional(),
  commandText: z.string().max(2000).optional(),
  volumePercent: z.number().int().min(0).max(100).optional(),
  downloadUrl: z.string().url().optional(),
  version: z.string().optional(),
})


export type CommandPayload = z.infer<typeof CommandPayloadSchema>

export const CommandResultSchema = z.object({
  commandId: z.string().uuid(),
  success: z.boolean(),
  output: z.string().optional(),
  error: z.string().optional(),
  executedAt: z.string().datetime(),
})

export type CommandResult = z.infer<typeof CommandResultSchema>