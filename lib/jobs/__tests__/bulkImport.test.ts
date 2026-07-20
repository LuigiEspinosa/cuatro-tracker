import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { Queue, Worker } from 'bullmq'
import type { Job } from 'bullmq'
import type Redis from 'ioredis'

// Mirrors lib/jobs/__tests__/steamAchievementSync.test.ts: real Redis Queue /
// Worker (BullMQ) with a mocked db. The STEAM_EXPORT format is chosen because
// its rows upsert directly from the file with NO adapter HTTP, so the whole
// processor flow (Redis file load + delete, parse, per-row upsert, progress
// publish, terminal frame, totals) runs deterministically without network.
//
// Note: Story 11.5 Task 3 asks for real Postgres here, but every db-touching
// suite in this repo (all 10, including the sibling BullMQ test) mocks @/lib/db
// and there is no real-Postgres wiring in vitest.config. Matching that
// convention; the real-stack path is covered by the gated e2e (Task 7).
const dbMock = vi.hoisted(() => ({
  mediaItem: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  userEntry: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: dbMock }))

const loggerMock = vi.hoisted(() => ({
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: loggerMock,
  createLogger: () => loggerMock,
}))

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

const TEST_QUEUE_NAME = `test-bulk-import-${Math.random().toString(36).slice(2, 10)}`

let redis: Redis
let bulkImportProcessor: (job: Job) => Promise<unknown>
let BULK_IMPORT_CHANNEL_PREFIX: string

beforeAll(async () => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
  const redisMod = await import('@/lib/redis')
  redis = redisMod.redis
  const mod = await import('@/lib/jobs/bulkImport')
  bulkImportProcessor = mod.bulkImportProcessor
  BULK_IMPORT_CHANNEL_PREFIX = mod.BULK_IMPORT_CHANNEL_PREFIX
})

afterAll(() => {
  vi.unstubAllEnvs()
})

function steamExport(games: Array<{ appid: number; name: string; playtime_forever?: number }>): string {
  return JSON.stringify({
    response: {
      games: games.map((g) => ({
        appid: g.appid,
        name: g.name,
        playtime_forever: g.playtime_forever ?? 0,
      })),
    },
  })
}

// Subscribe on a dedicated connection (ioredis subscriber mode blocks ordinary
// commands on the shared client) and collect published frames.
async function collectChannel(
  channel: string,
): Promise<{ messages: string[]; stop: () => Promise<void> }> {
  const sub = redis.duplicate()
  const messages: string[] = []
  sub.on('message', (_ch, msg) => messages.push(msg))
  await sub.subscribe(channel)
  return {
    messages,
    stop: async () => {
      await sub.unsubscribe(channel)
      sub.disconnect()
    },
  }
}

describe('bulkImportProcessor (BullMQ integration, real Redis, mocked db)', () => {
  let queue: Queue
  let worker: Worker | undefined

  beforeEach(async () => {
    queue = new Queue(TEST_QUEUE_NAME, { connection: redis })
    await queue.drain()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    if (worker) {
      await worker.close()
      worker = undefined
    }
    await queue.drain()
    await queue.close()
  })

  async function runJob(jobId: string, format: string, fileText: string) {
    const fileKey = `bulkImport:file:${jobId}`
    await redis.set(fileKey, fileText)
    const channel = `${BULK_IMPORT_CHANNEL_PREFIX}${jobId}`
    const collector = await collectChannel(channel)

    let result: unknown
    worker = new Worker(
      TEST_QUEUE_NAME,
      async (job) => {
        result = await bulkImportProcessor(job)
        return result
      },
      { connection: redis },
    )

    await new Promise<void>((resolve, reject) => {
      worker!.on('completed', () => resolve())
      worker!.on('failed', (_job, err) => reject(err))
      queue.add('import', { format, redisKey: fileKey }, { jobId })
    })

    // Let the terminal publish land on the subscriber.
    await new Promise((r) => setTimeout(r, 50))
    await collector.stop()
    return { result, messages: collector.messages, fileKey }
  }

  it(
    'imports new Steam rows, publishes progress + complete, and deletes the file key',
    async () => {
      dbMock.mediaItem.findUnique.mockResolvedValue(null)
      dbMock.mediaItem.create.mockResolvedValue({})

      const file = steamExport([
        { appid: 900000001, name: 'Alpha', playtime_forever: 1200 },
        { appid: 900000002, name: 'Beta', playtime_forever: 0 },
      ])

      const { result, messages, fileKey } = await runJob(
        'test-import-new',
        'STEAM_EXPORT',
        file,
      )

      expect(result).toEqual({ imported: 2, duplicates: 0, failed: 0, total: 2 })

      // Two GAME MediaItems created with steam_app_id + the UserEntry patch.
      expect(dbMock.mediaItem.create).toHaveBeenCalledTimes(2)
      const firstCreate = dbMock.mediaItem.create.mock.calls[0]![0]
      expect(firstCreate.data).toMatchObject({
        type: 'GAME',
        title: 'Alpha',
        steam_app_id: 900000001,
        playtime_minutes: 1200,
      })
      expect(firstCreate.data.user_entry.create).toMatchObject({
        status: 'WATCHING',
        progress: 0,
        user_rating: null,
      })
      // Unplayed game maps to PLAN_TO_WATCH.
      const secondCreate = dbMock.mediaItem.create.mock.calls[1]![0]
      expect(secondCreate.data.user_entry.create.status).toBe('PLAN_TO_WATCH')

      // Progress frames for each row + a terminal complete frame.
      const frames = messages.map((m) => JSON.parse(m))
      expect(frames).toContainEqual(
        expect.objectContaining({ processed: 1, total: 2, current_title: 'Alpha' }),
      )
      expect(frames).toContainEqual(
        expect.objectContaining({ processed: 2, total: 2, current_title: 'Beta' }),
      )
      expect(frames).toContainEqual(
        expect.objectContaining({
          phase: 'complete',
          imported: 2,
          duplicates: 0,
          total: 2,
        }),
      )

      // The uploaded file is consumed (deleted), not left in Redis.
      expect(await redis.get(fileKey)).toBeNull()
    },
    25_000,
  )

  it(
    'counts an already-present source id as a duplicate no-op',
    async () => {
      dbMock.mediaItem.findUnique.mockResolvedValue({ id: 'existing-1' })
      dbMock.userEntry.findUnique.mockResolvedValue({ id: 'ue-1' })

      const file = steamExport([
        { appid: 900000003, name: 'Gamma', playtime_forever: 50 },
      ])

      const { result } = await runJob('test-import-dup', 'STEAM_EXPORT', file)

      expect(result).toEqual({ imported: 0, duplicates: 1, failed: 0, total: 1 })
      // Existing MediaItem + existing UserEntry: no create on either.
      expect(dbMock.mediaItem.create).not.toHaveBeenCalled()
      expect(dbMock.userEntry.create).not.toHaveBeenCalled()
    },
    25_000,
  )
})
