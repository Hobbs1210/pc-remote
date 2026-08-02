import { IQueueAdapter } from './types.js'
import { InMemoryQueueAdapter } from './in-memory.adapter.js'
import { BullMQAdapter } from './bullmq.adapter.js'

export function createQueueAdapter(): IQueueAdapter {
  const driver = process.env.QUEUE_DRIVER ?? (process.env.REDIS_URL ? 'bullmq' : 'memory')

  if (driver === 'bullmq' || process.env.REDIS_URL) {
    const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
    console.log(`[Queue] Initializing BullMQ adapter (Redis: ${redisUrl})`)
    return new BullMQAdapter(redisUrl)
  }

  console.log('[Queue] Initializing In-Memory Queue adapter (No Redis required)')
  return new InMemoryQueueAdapter()
}
