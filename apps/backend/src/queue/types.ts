export interface JobOptions {
  delay?: number // milliseconds
  attempts?: number // retry count
  backoff?: number // backoff delay in ms
  repeat?: {
    cron?: string
    every?: number // interval in ms
  }
}

export interface Job<T = unknown> {
  id: string
  name: string
  data: T
  timestamp: number
  attemptsMade?: number
}

export interface FailedJob<T = unknown> {
  id: string
  queueName: string
  jobName: string
  data: T
  error: string
  failedAt: number
  attemptsMade: number
}

export type JobHandler<T = unknown> = (job: Job<T>) => Promise<void>

export interface IQueueAdapter {
  add<T>(queueName: string, jobName: string, data: T, opts?: JobOptions): Promise<string>
  process<T>(queueName: string, handler: JobHandler<T>): void
  getFailedJobs(): Promise<FailedJob[]>
  retryFailedJob(id: string): Promise<boolean>
  clearFailedJobs(): Promise<void>
  close(): Promise<void>
}
