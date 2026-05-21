import * as Sentry from '@sentry/nextjs'
import { Worker } from 'bullmq'
import { env } from '@/lib/env'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { scrubEvent } from '@/lib/sentry-scrub'
import {
  closeQueueRegistry,
  processors,
  queues,
  registerScheduledJobs,
} from '@/lib/jobs/queues'

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubEvent(event)
    },
  })
}

const workers = queues.map(({ name }) =>
  new Worker(
    name,
    async (job) => {
      const start = Date.now()
      logger.info(
        { event: 'job.start', queue: name, jobId: job.id, jobName: job.name },
        'job started',
      )
      try {
        const processor = processors[name]
        if (!processor) {
          throw new Error(`No processor bound for queue: ${name}`)
        }
        const result = await processor(job)
        logger.info(
          {
            event: 'job.complete',
            queue: name,
            jobId: job.id,
            durationMs: Date.now() - start,
          },
          'job complete',
        )
        return result
      } catch (err) {
        logger.error(
          {
            event: 'job.fail',
            queue: name,
            jobId: job.id,
            durationMs: Date.now() - start,
            err,
          },
          'job failed',
        )
        throw err
      }
    },
    { connection: redis },
  ),
)

// Gate `worker.ready` on cron registration completing: if Redis is briefly
// unavailable at boot (rolling deploy), the previous fire-and-forget path
// would silently leave crons unregistered until manual restart. A failure
// here propagates and crashes the worker so the orchestrator restarts it
// (Bundle A code-review finding).
//
// Uses a then/catch chain instead of top-level await because project-context
// `target: ES2017` forbids top-level await in the worker entrypoint module.
registerScheduledJobs()
  .then(() => {
    logger.info(
      { event: 'worker.ready', queues: queues.map((q) => q.name) },
      'worker ready',
    )
  })
  .catch((err: unknown) => {
    logger.error(
      { event: 'worker.cron.registration_failed', err },
      'worker cron registration failed; crashing for orchestrator restart',
    )
    process.exit(1)
  })

let shutdownStarted = false
async function gracefulShutdown(signal: string) {
  if (shutdownStarted) return
  shutdownStarted = true
  logger.info(
    { event: 'worker.shutdown.start', signal },
    'worker shutdown starting',
  )
  try {
    await Promise.all(workers.map((w) => w.close()))
    // Close registry Queues before quitting redis so BullMQ flushes any
    // pending writes through the shared connection (Bundle A code-review
    // finding).
    await closeQueueRegistry()
    await redis.quit()
    logger.info({ event: 'worker.shutdown.complete' }, 'worker shutdown complete')
    process.exit(0)
  } catch (err) {
    logger.error({ event: 'worker.shutdown.error', err }, 'worker shutdown failed')
    process.exit(1)
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
