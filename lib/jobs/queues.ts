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
import { BULK_IMPORT_QUEUE, bulkImportProcessor } from '@/lib/jobs/bulkImport'

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
  // Story 11.5: enqueued on demand by POST /api/admin/import, not scheduled, so
  // it registers here (worker.ts binds every registry queue) but is absent from
  // CRONS below.
  const bulkImport = new Queue(BULK_IMPORT_QUEUE, {
    connection: redis,
  })

  return {
    queues: [
      { name: IGDB_TOKEN_REFRESH_QUEUE, queue: igdbTokenRefresh },
      { name: STEAM_ACHIEVEMENT_SYNC_QUEUE, queue: steamAchievementSync },
      { name: BULK_IMPORT_QUEUE, queue: bulkImport },
    ],
    processors: {
      [IGDB_TOKEN_REFRESH_QUEUE]: igdbTokenRefreshProcessor,
      [STEAM_ACHIEVEMENT_SYNC_QUEUE]: steamAchievementSyncProcessor,
      [BULK_IMPORT_QUEUE]: bulkImportProcessor,
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
// Uses `upsertJobScheduler` (BullMQ v5 idiomatic). Unlike the legacy
// `queue.add(name, data, { repeat, jobId })` path which keys repeatables by
// `{name, pattern, jobId}` and silently duplicates when the pattern changes,
// `upsertJobScheduler` keys solely by `schedulerId`. Subsequent calls with
// the same id replace the previous entry — pattern edits land cleanly on
// the next deploy (Bundle A code-review finding).
type CronEntry = {
  queueName: string
  jobName: string
  schedulerId: string
  pattern: string
}

const CRONS: CronEntry[] = [
  {
    queueName: IGDB_TOKEN_REFRESH_QUEUE,
    jobName: 'refresh',
    schedulerId: 'igdbTokenRefresh-cron',
    pattern: '0 3 * * *',
  },
  {
    queueName: STEAM_ACHIEVEMENT_SYNC_QUEUE,
    jobName: 'sync',
    schedulerId: 'steamAchievementSync-cron',
    pattern: '0 */6 * * *',
  },
]

export async function registerScheduledJobs(): Promise<void> {
  for (const cron of CRONS) {
    const entry = queues.find((q) => q.name === cron.queueName)
    if (!entry) continue
    await entry.queue.upsertJobScheduler(
      cron.schedulerId,
      { pattern: cron.pattern, tz: 'UTC' },
      { name: cron.jobName, data: {} },
    )
    logger.info(
      {
        event: 'queue.cron.registered',
        queue: cron.queueName,
        pattern: cron.pattern,
      },
      'cron registered',
    )
  }
}

// Close every Queue in the registry and clear the global singleton slot.
// Called from worker.ts gracefulShutdown so SIGTERM doesn't leave open
// BullMQ Queue handles attached to the Redis connection — and so tests can
// dispose between runs (Bundle A code-review finding).
export async function closeQueueRegistry(): Promise<void> {
  await Promise.all(queues.map(({ queue }) => queue.close()))
  globalForQueues.__cuatroQueueRegistry = undefined
}
