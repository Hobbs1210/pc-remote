import { z } from 'zod'

export const TimeSlotSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),
})

// 0 = воскресенье, 1-6 = пн-сб (стандарт JS Date)
export const DayOfWeekSchema = z.number().int().min(0).max(6)

// Комендантский час — жёсткий запрет на доступ (приоритет над всем остальным)
export const DowntimeConfigSchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'), // "23:00"
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Format: HH:MM'),   // "07:00"
})

// Дневной лимит — «кошелёк» времени
export const DailyLimitConfigSchema = z.object({
  enabled: z.boolean(),
  minutesWeekday: z.number().int().min(1).max(1440), // будни
  minutesWeekend: z.number().int().min(1).max(1440), // выходные (сб/вс)
})

export const WeeklyScheduleSchema = z.object({
  enabled: z.boolean(),
  days: z.record(
    z.coerce.string(),
    z.array(TimeSlotSchema)
  ),
  timezone: z.string(), // 'Europe/Moscow', 'Europe/Riga' и т.д.
  downtime: DowntimeConfigSchema.optional(),
  dailyLimit: DailyLimitConfigSchema.optional(),
  blockedApps: z.array(z.string()).optional(),
  lockUntil: z.string().datetime().nullable().optional(),
})


export const OverrideSchema = z.object({
  id: z.string().uuid(),
  date: z.string().date(), // 'YYYY-MM-DD'
  slots: z.array(TimeSlotSchema),
  reason: z.string().max(100).optional(),
})

export type WeeklySchedule = z.infer<typeof WeeklyScheduleSchema>
export type Override = z.infer<typeof OverrideSchema>
export type TimeSlot = z.infer<typeof TimeSlotSchema>
export type DowntimeConfig = z.infer<typeof DowntimeConfigSchema>
export type DailyLimitConfig = z.infer<typeof DailyLimitConfigSchema>