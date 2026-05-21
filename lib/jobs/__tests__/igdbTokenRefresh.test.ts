import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Queue, Worker } from 'bullmq'
import type Redis from 'ioredis'

// Integration test for the igdbTokenRefresh BullMQ processor wired through
// the queue registry from lib/jobs/queues.ts. Hits real Redis from
// `pnpm infra` (local) or the redis service in CI; mocks Twitch via
// vi.stubGlobal('fetch') so the processor never makes an external request.

const validEnv: Record<string, string> = {
  NEXTAUTH_SECRET: 'a'.repeat(64),
  NEXTAUTH_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://tracker:password@localhost:5432/tracker',
  REDIS_URL: 'redis://localhost:6379',
  ADMIN_PASS: 'password123',
  DB_PASS: 'password',
  TMDB_API_KEY: 'tmdb-key',
  ANILIST_USER_AGENT: 'cuatro-tracker/test',
  IGDB_CLIENT_ID: 'igdb-id',
  IGDB_CLIENT_SECRET: 'igdb-secret',
  STEAM_API_KEY: 'steam-key',
  STEAM_USER_ID: '76561197960287930',
  QBITTORRENT_HOST: 'http://qbittorrent:8080',
  QBITTORRENT_USER: 'admin',
  QBITTORRENT_PASS: 'qbpass',
  DOWNLOAD_PATH: '/downloads',
  LOG_LEVEL: 'info',
}

const TEST_QUEUE_NAME = `test-igdb-token-${Math.random().toString(36).slice(2, 10)}`

let redis: Redis
let processors: Record<string, (job: import('bullmq').Job) => Promise<unknown>>

beforeAll(async () => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
  const redisMod = await import('@/lib/redis')
  redis = redisMod.redis
  const queuesMod = await import('@/lib/jobs/queues')
  processors = queuesMod.processors
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('igdbTokenRefresh processor (BullMQ integration)', () => {
  let queue: Queue
  let worker: Worker | undefined

  beforeEach(async () => {
    queue = new Queue(TEST_QUEUE_NAME, { connection: redis })
    await queue.drain()
    await redis.del('igdb:token', 'igdb:token:expiresAt')
  })

  afterEach(async () => {
    if (worker) {
      await worker.close()
      worker = undefined
    }
    await queue.drain()
    await queue.close()
    await redis.del('igdb:token', 'igdb:token:expiresAt')
    vi.unstubAllGlobals()
  })

  it(
    'enqueued job runs the registered processor and persists token + expiresAt to Redis',
    async () => {
      // Mock the Twitch token endpoint. The processor delegates to
      // refreshIgdbToken which calls fetch under the hood.
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                access_token: 'integration-token',
                expires_in: 5184000,
                token_type: 'bearer',
              }),
              {
                status: 200,
                headers: { 'content-type': 'application/json' },
              },
            ),
        ),
      )

      const processor = processors.igdbTokenRefresh
      expect(processor).toBeDefined()

      worker = new Worker(
        TEST_QUEUE_NAME,
        async (job) => processor!(job),
        { connection: redis },
      )

      await new Promise<void>((resolve, reject) => {
        worker!.on('completed', () => resolve())
        worker!.on('failed', (_job, err) => reject(err))
        queue.add('manual', {}, { jobId: 'test-manual-refresh' })
      })

      const persistedToken = await redis.get('igdb:token')
      const persistedExpiresAt = await redis.get('igdb:token:expiresAt')

      expect(persistedToken).toBe('integration-token')
      expect(persistedExpiresAt).not.toBeNull()
      expect(Number(persistedExpiresAt)).toBeGreaterThan(Date.now())
    },
    20_000,
  )
})
