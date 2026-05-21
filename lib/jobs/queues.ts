import { Queue, type Job } from 'bullmq'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import {
  IGDB_TOKEN_REFRESH_QUEUE,
  igdbTokenRefreshProcessor,
} from '@/lib/jobs/igdbTokenRefresh'

// Module-level Queue singletons via the globalThis pattern (mirrors
// lib/redis.ts and lib/db.ts). Survives dev hot-reload without leaking
// connection-per-edit Queue instances.

type ProcessorFn = (job: Job) => Promise<unknown>
type QueueEntry = { name: string; queue: Queue }

const globalForQueues = globalThis as unknown as {
  __cuatroQueueRegistry?: {
    queues: QueueEntry[]
    processors: Record<string, ProcessorFn>
  }
}

function makeRegistry(): {
  queues: QueueEntry[]
  processors: Record<string, ProcessorFn>
} {
  const igdbTokenRefresh = new Queue(IGDB_TOKEN_REFRESH_QUEUE, {
    connection: redis,
  })

  return {
    queues: [{ name: IGDB_TOKEN_REFRESH_QUEUE, queue: igdbTokenRefresh }],
    processors: {
      [IGDB_TOKEN_REFRESH_QUEUE]: igdbTokenRefreshProcessor,
    },
  }
}

const registry = globalForQueues.__cuatroQueueRegistry ?? makeRegistry()
globalForQueues.__cuatroQueueRegistry = registry

export const queues = registry.queues
export const processors = registry.processors

// Scheduled-job registration runs only from the worker entrypoint at startup,
// never on module load. Route handlers that just want to enqueue a one-off
// job import `queues` without triggering cron writes.
//
// Repeat patterns:
//   - igdbTokenRefresh: 0 3 * * * UTC (daily 3am, low-traffic window) per AC-6.
//
// jobId on a repeat is BullMQ's dedup key — re-calling registerScheduledJobs
// on subsequent worker restarts replaces the same scheduler entry instead of
// fanning out.
export async function registerScheduledJobs(): Promise<void> {
  const igdb = queues.find((q) => q.name === IGDB_TOKEN_REFRESH_QUEUE)?.queue
  if (!igdb) return
  try {
    await igdb.add(
      'refresh',
      {},
      {
        repeat: { pattern: '0 3 * * *', tz: 'UTC' },
        jobId: 'igdbTokenRefresh-cron',
      },
    )
    logger.info(
      {
        event: 'queue.cron.registered',
        queue: IGDB_TOKEN_REFRESH_QUEUE,
        pattern: '0 3 * * *',
      },
      'cron registered',
    )
  } catch (err) {
    logger.error(
      { event: 'queue.cron.register_error', queue: IGDB_TOKEN_REFRESH_QUEUE, err },
      'cron registration failed',
    )
  }
}
