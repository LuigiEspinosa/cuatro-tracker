import Redis from 'ioredis'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

const globalForRedis = globalThis as unknown as { redis: Redis | undefined }

function makeClient(): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: env.NODE_ENV === 'test',
  })

  client.on('connect', () =>
    logger.info({ event: 'redis.connect' }, 'redis connected'),
  )
  client.on('ready', () =>
    logger.info({ event: 'redis.ready' }, 'redis ready'),
  )
  client.on('reconnecting', (delay: number) =>
    logger.warn({ event: 'redis.reconnecting', delay }, 'redis reconnecting'),
  )
  client.on('error', (err: Error) =>
    logger.error({ event: 'redis.error', err: err.message }, 'redis error'),
  )
  client.on('end', () =>
    logger.info({ event: 'redis.end' }, 'redis connection closed'),
  )

  return client
}

export const redis = globalForRedis.redis ?? makeClient()

globalForRedis.redis = redis

export async function closeRedis(): Promise<void> {
  try {
    await redis.quit()
  } catch (err) {
    // redis.quit() throws synchronously if the client was never connected
    // (lazyConnect: true in tests) or has already been closed. Both are
    // acceptable terminal states for a graceful shutdown caller.
    if (
      err instanceof Error &&
      /Connection is (already )?closed/i.test(err.message)
    ) {
      return
    }
    throw err
  }
}
