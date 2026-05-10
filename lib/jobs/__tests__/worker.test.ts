import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Queue, Worker } from 'bullmq'
import type Redis from 'ioredis'

// Integration test for the BullMQ worker scaffold per Story 1.23 AC-4.
// Hits real Redis from `pnpm infra` (local) or the redis service in CI (post-1.15).
// Does NOT spawn worker.ts as a child process; exercises the same Worker construction
// shape inline so the close-drains-in-flight contract can be asserted in-process.

// validEnv must mirror the required fields in lib/env.ts EnvSchema.
const validEnv: Record<string, string> = {
  NEXTAUTH_SECRET: 'a'.repeat(64),
  NEXTAUTH_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://tracker:password@localhost:5432/tracker',
  REDIS_URL: 'redis://localhost:6379',
  ADMIN_PASS: 'password123',
  DB_PASS: 'password',
  TMDB_API_KEY: 'tmdb-key',
  IGDB_CLIENT_ID: 'igdb-id',
  IGDB_CLIENT_SECRET: 'igdb-secret',
  STEAM_API_KEY: 'steam-key',
  STEAM_USER_ID: '76561197960287930',
  QBITTORRENT_HOST: 'http://qbittorrent:8080',
  QBITTORRENT_USER: 'admin',
  QBITTORRENT_PASS: 'qbpass',
  DOWNLOAD_PATH: '/downloads',
}

const TEST_QUEUE_NAME = `test-worker-${Math.random().toString(36).slice(2, 10)}`

let redis: Redis

beforeAll(async () => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
  const mod = await import('@/lib/redis')
  redis = mod.redis
})

describe('worker scaffold (BullMQ + ioredis)', () => {
  let queue: Queue
  let worker: Worker | undefined

  beforeEach(async () => {
    queue = new Queue(TEST_QUEUE_NAME, { connection: redis })
    await queue.drain()
  })

  afterEach(async () => {
    if (worker) {
      await worker.close()
      worker = undefined
    }
    await queue.drain()
    await queue.close()
  })

  it(
    'picks up an enqueued job and runs the processor',
    async () => {
      const processed = vi.fn().mockResolvedValue('ok')

      worker = new Worker(
        TEST_QUEUE_NAME,
        async (job) => processed(job.data),
        { connection: redis },
      )

      await new Promise<void>((resolve, reject) => {
        worker!.on('completed', () => resolve())
        worker!.on('failed', (_job, err) => reject(err))
        queue.add('noop', { hello: 'world' })
      })

      expect(processed).toHaveBeenCalledTimes(1)
      expect(processed).toHaveBeenCalledWith({ hello: 'world' })
    },
    15_000,
  )

  it(
    'Worker.close() drains in-flight before resolving',
    async () => {
      let processorStarted = false
      let processorFinished = false

      worker = new Worker(
        TEST_QUEUE_NAME,
        async () => {
          processorStarted = true
          await new Promise((r) => setTimeout(r, 200))
          processorFinished = true
          return 'ok'
        },
        { connection: redis },
      )

      await queue.add('slow', {})

      while (!processorStarted) {
        await new Promise((r) => setTimeout(r, 25))
      }

      await worker.close()

      expect(processorFinished).toBe(true)
    },
    15_000,
  )
})
