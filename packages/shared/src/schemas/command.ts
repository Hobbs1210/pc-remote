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
])


export type CommandType = z.infer<typeof CommandTypeSchema>

export const CommandPayloadSchema = z.object({
  type: CommandTypeSchema,
  delaySeconds: z.number().int().min(0).max(3600).default(0),
  message: z.string().max(200).optional(),
  pid: z.number().int().optional(),
})

export type CommandPayload = z.infer<typeof CommandPayloadSchema>


export const CommandResultSchema = z.object({
  commandId: z.string().uuid(),
  success: z.boolean(),
  error: z.string().optional(),
  executedAt: z.string().datetime(),
})

export type CommandResult = z.infer<typeof CommandResultSchema>