import { Queue, Worker, JobsOptions as BullJobsOptions } from 'bullmq'
import { Redis } from 'ioredis'
import type { Redis as RedisType } from 'ioredis'
import { FailedJob, IQueueAdapter, Job, JobHandler, JobOptions } from './types.js'

export class BullMQAdapter implements IQueueAdapter {
  private queues = new Map<string, Queue>()
  private workers = new Map<string, Worker>()
  private redisConnection: RedisType

  constructor(redisUrlOrOptions: string | object) {
    if (typeof redisUrlOrOptions === 'string') {
      this.redisConnection = new Redis(redisUrlOrOptions, { maxRetriesPerRequest: null })
    } else {
      this.redisConnection = new Redis({ maxRetriesPerRequest: null, ...redisUrlOrOptions })
    }
  }

  private getOrCreateQueue(queueName: string): Queue {
    let q = this.queues.get(queueName)
    if (!q) {
      q = new Queue(queueName, { connection: this.redisConnection })
      this.queues.set(queueName, q)
    }
    return q
  }

  async add<T>(queueName: string, jobName: string, data: T, opts?: JobOptions): Promise<string> {
    const q = this.getOrCreateQueue(queueName)

    const bullOpts: any = {}
    if (opts?.delay) bullOpts.delay = opts.delay
    if (opts?.attempts) bullOpts.attempts = opts.attempts
    if (opts?.backoff) bullOpts.backoff = { type: 'exponential', delay: opts.backoff }
    if (opts?.repeat?.every) bullOpts.repeat = { every: opts.repeat.every }
    if (opts?.repeat?.cron) bullOpts.repeat = { pattern: opts.repeat.cron }

    const job = await q.add(jobName, data, bullOpts as BullJobsOptions)
    return job.id ?? jobName
  }

  process<T>(queueName: string, handler: JobHandler<T>): void {
    if (this.workers.has(queueName)) {
      throw new Error(`Worker for queue "${queueName}" is already registered`)
    }

    const worker = new Worker<T>(
      queueName,
      async (bullJob) => {
        const job: Job<T> = {
          id: bullJob.id ?? bullJob.name,
          name: bullJob.name,
          data: bullJob.data,
          timestamp: bullJob.timestamp,
          attemptsMade: bullJob.attemptsMade,
        }
        await handler(job)
      },
      { connection: this.redisConnection }
    )

    this.workers.set(queueName, worker)
  }

  async getFailedJobs(): Promise<FailedJob[]> {
    const results: FailedJob[] = []
    for (const [queueName, q] of this.queues.entries()) {
      const failed = await q.getFailed()
      for (const j of failed) {
        results.push({
          id: j.id ?? j.name,
          queueName,
          jobName: j.name,
          data: j.data,
          error: j.failedReason ?? 'Unknown error',
          failedAt: j.finishedOn ?? Date.now(),
          attemptsMade: j.attemptsMade,
        })
      }
    }
    return results
  }

  async retryFailedJob(id: string): Promise<boolean> {
    for (const q of this.queues.values()) {
      const job = await q.getJob(id)
      if (job) {
        await job.retry()
        return true
      }
    }
    return false
  }

  async clearFailedJobs(): Promise<void> {
    for (const q of this.queues.values()) {
      await q.clean(0, 0, 'failed')
    }
  }

  async close(): Promise<void> {
    for (const worker of this.workers.values()) {
      await worker.close()
    }
    for (const q of this.queues.values()) {
      await q.close()
    }
    this.workers.clear()
    this.queues.clear()
    await this.redisConnection.quit()
  }
}
