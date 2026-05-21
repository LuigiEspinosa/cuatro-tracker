import { Queue, type Job } from 'bullmq'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import {
  IGDB_TOKEN_REFRESH_QUEUE,
  igdbTokenRefreshProcessor,
} from '@/lib/jobs/igdbTokenRefresh'
import {
  STEAM_ACHIEVEMENT_SYNC_QUEUE,
  steamAchievementSyncProcessor,
} from '@/lib/jobs/steamAchievementSync'

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
  const steamAchievementSync = new Queue(STEAM_ACHIEVEMENT_SYNC_QUEUE, {
    connection: redis,
  })

  return {
    queues: [
      { name: IGDB_TOKEN_REFRESH_QUEUE, queue: igdbTokenRefresh },
      { name: STEAM_ACHIEVEMENT_SYNC_QUEUE, queue: steamAchievementSync },
    ],
    processors: {
      [IGDB_TOKEN_REFRESH_QUEUE]: igdbTokenRefreshProcessor,
      [STEAM_ACHIEVEMENT_SYNC_QUEUE]: steamAchievementSyncProcessor,
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
//   - igdbTokenRefresh: 0 3 * * * UTC (daily 3am, low-traffic window) per Story 9.1 AC-6.
//   - steamAchievementSync: 0 */6 * * * UTC (every 6h) per Story 9.2 AC-8.
//
// jobId on a repeat is BullMQ's dedup key — re-calling registerScheduledJobs
// on subsequent worker restarts replaces the same scheduler entry instead of
// fanning out.
type CronEntry = {
  queueName: string
  jobName: string
  jobId: string
  pattern: string
}

const CRONS: CronEntry[] = [
  {
    queueName: IGDB_TOKEN_REFRESH_QUEUE,
    jobName: 'refresh',
    jobId: 'igdbTokenRefresh-cron',
    pattern: '0 3 * * *',
  },
  {
    queueName: STEAM_ACHIEVEMENT_SYNC_QUEUE,
    jobName: 'sync',
    jobId: 'steamAchievementSync-cron',
    pattern: '0 */6 * * *',
  },
]

export async function registerScheduledJobs(): Promise<void> {
  for (const cron of CRONS) {
    const entry = queues.find((q) => q.name === cron.queueName)
    if (!entry) continue
    try {
      await entry.queue.add(
        cron.jobName,
        {},
        {
          repeat: { pattern: cron.pattern, tz: 'UTC' },
          jobId: cron.jobId,
        },
      )
      logger.info(
        {
          event: 'queue.cron.registered',
          queue: cron.queueName,
          pattern: cron.pattern,
        },
        'cron registered',
      )
    } catch (err) {
      logger.error(
        {
          event: 'queue.cron.register_error',
          queue: cron.queueName,
          err,
        },
        'cron registration failed',
      )
    }
  }
}
