import { FailedJob, IQueueAdapter, Job, JobHandler, JobOptions } from './types.js'
import crypto from 'node:crypto'

export class InMemoryQueueAdapter implements IQueueAdapter {
  private handlers = new Map<string, JobHandler<any>>()
  private timers = new Set<NodeJS.Timeout>()
  private failedJobs: FailedJob[] = []
  private isClosed = false

  async add<T>(queueName: string, jobName: string, data: T, opts?: JobOptions): Promise<string> {
    if (this.isClosed) throw new Error('Queue is closed')

    const id = crypto.randomUUID()
    const job: Job<T> = {
      id,
      name: jobName,
      data,
      timestamp: Date.now(),
      attemptsMade: 0,
    }

    const runJob = async () => {
      const handler = this.handlers.get(queueName)
      if (!handler) return

      const maxAttempts = opts?.attempts ?? 1
      const backoff = opts?.backoff ?? 1000

      while (job.attemptsMade! < maxAttempts && !this.isClosed) {
        try {
          job.attemptsMade!++
          await handler(job)
          break // Success
        } catch (err: any) {
          if (job.attemptsMade! >= maxAttempts) {
            console.error(`[InMemoryQueue] Job ${job.name} (${job.id}) failed after ${maxAttempts} attempts:`, err)
            this.failedJobs.push({
              id: job.id,
              queueName,
              jobName: job.name,
              data: job.data,
              error: err?.message ?? String(err),
              failedAt: Date.now(),
              attemptsMade: job.attemptsMade!,
            })
            if (this.failedJobs.length > 100) {
              this.failedJobs.shift()
            }
          } else {
            await new Promise((r) => setTimeout(r, backoff * Math.pow(2, job.attemptsMade! - 1)))
          }
        }
      }
    }

    // Repeatable Job (Interval) — skip immediate execution, only interval
    if (opts?.repeat?.every && opts.repeat.every > 0) {
      const interval = setInterval(() => {
        if (this.isClosed) {
          clearInterval(interval)
          return
        }
        void runJob()
      }, opts.repeat.every)
      this.timers.add(interval)
    } else if (opts?.delay && opts.delay > 0) {
      // Delayed Execution
      const timer = setTimeout(() => {
        this.timers.delete(timer)
        void runJob()
      }, opts.delay)
      this.timers.add(timer)
    } else {
      // Immediate execution in microtask
      queueMicrotask(() => void runJob())
    }

    return id
  }

  process<T>(queueName: string, handler: JobHandler<T>): void {
    this.handlers.set(queueName, handler)
  }

  async getFailedJobs(): Promise<FailedJob[]> {
    return [...this.failedJobs]
  }

  async retryFailedJob(id: string): Promise<boolean> {
    const idx = this.failedJobs.findIndex((j) => j.id === id)
    if (idx === -1) return false

    const failed = this.failedJobs[idx]
    if (!failed) return false
    this.failedJobs.splice(idx, 1)

    await this.add(failed.queueName, failed.jobName, failed.data)
    return true
  }

  async clearFailedJobs(): Promise<void> {
    this.failedJobs = []
  }

  async close(): Promise<void> {
    this.isClosed = true
    for (const timer of this.timers) {
      clearTimeout(timer)
      clearInterval(timer)
    }
    this.timers.clear()
    this.handlers.clear()
  }
}
