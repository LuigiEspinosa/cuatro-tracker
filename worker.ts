import * as Sentry from '@sentry/nextjs'
import { Worker } from 'bullmq'
import { env } from '@/lib/env'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { scrubEvent } from '@/lib/sentry-scrub'
import { queues } from '@/lib/jobs/queues'

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
        const result = undefined
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

logger.info(
  { event: 'worker.ready', queues: queues.map((q) => q.name) },
  'worker ready',
)

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
