import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { Queue, Worker } from 'bullmq'
import type Redis from 'ioredis'

const dbMock = vi.hoisted(() => ({
  mediaItem: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  achievement: {
    upsert: vi.fn(),
  },
  // The sync processor wraps each game's upserts + status update in a
  // db.$transaction([...]) — the mock awaits the array verbatim so the
  // individual upsert/update calls remain trackable on their dedicated
  // mocks (Bundle A code-review followup).
  $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
}))

vi.mock('@/lib/db', () => ({ db: dbMock }))

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

const TEST_QUEUE_NAME = `test-steam-sync-${Math.random().toString(36).slice(2, 10)}`

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

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

describe('steamAchievementSync processor (BullMQ integration, mocked db + fetch)', () => {
  let queue: Queue
  let worker: Worker | undefined

  beforeEach(async () => {
    queue = new Queue(TEST_QUEUE_NAME, { connection: redis })
    await queue.drain()
    vi.resetAllMocks()
  })

  afterEach(async () => {
    if (worker) {
      await worker.close()
      worker = undefined
    }
    await queue.drain()
    await queue.close()
    vi.unstubAllGlobals()
  })

  it(
    'upserts achievements and sets achievement_sync_status to ok for a public-profile game',
    async () => {
      dbMock.mediaItem.findMany.mockResolvedValueOnce([
        { id: 'game-1', steam_app_id: 1942 },
      ])
      dbMock.achievement.upsert.mockResolvedValue({})
      dbMock.mediaItem.update.mockResolvedValue({})

      vi.stubGlobal(
        'fetch',
        vi
          .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
          // GetPlayerAchievements
          .mockResolvedValueOnce(
            jsonResponse({
              playerstats: {
                steamID: '76561197960287930',
                gameName: 'Witcher 3',
                success: true,
                achievements: [
                  { apiname: 'ach_01', achieved: 1, unlocktime: 1700000000 },
                  { apiname: 'ach_02', achieved: 0, unlocktime: 0 },
                ],
              },
            }),
          )
          // GetGlobalAchievementPercentagesForApp
          .mockResolvedValueOnce(
            jsonResponse({
              achievementpercentages: {
                achievements: [
                  // ach_02 intentionally omitted so its percent_global degrades to null.
                  { name: 'ach_01', percent: 75.5 },
                ],
              },
            }),
          )
          // GetSchemaForGame
          .mockResolvedValueOnce(
            jsonResponse({
              game: {
                availableGameStats: {
                  achievements: [
                    {
                      name: 'ach_01',
                      displayName: 'First Steps',
                      description: 'Take your first step.',
                      icon: 'http://icon/01.png',
                    },
                    {
                      name: 'ach_02',
                      displayName: 'Second Steps',
                      icon: 'http://icon/02.png',
                    },
                  ],
                },
              },
            }),
          ),
      )

      const processor = processors.steamAchievementSync
      expect(processor).toBeDefined()

      worker = new Worker(
        TEST_QUEUE_NAME,
        async (job) => processor!(job),
        { connection: redis },
      )

      await new Promise<void>((resolve, reject) => {
        worker!.on('completed', () => resolve())
        worker!.on('failed', (_job, err) => reject(err))
        queue.add('manual', {}, { jobId: 'test-steam-public' })
      })

      expect(dbMock.achievement.upsert).toHaveBeenCalledTimes(2)
      const firstUpsertArgs = dbMock.achievement.upsert.mock.calls[0]![0]
      expect(firstUpsertArgs).toMatchObject({
        where: {
          game_id_steam_api_name: {
            game_id: 'game-1',
            steam_api_name: 'ach_01',
          },
        },
        create: expect.objectContaining({
          game_id: 'game-1',
          steam_api_name: 'ach_01',
          display_name: 'First Steps',
          unlocked: true,
          percent_global: 75.5,
        }),
        update: expect.objectContaining({ percent_global: 75.5 }),
      })

      // ach_02 is absent from GetGlobalAchievementPercentagesForApp, so its
      // percent_global degrades to null on both upsert branches.
      const secondUpsertArgs = dbMock.achievement.upsert.mock.calls[1]![0]
      expect(secondUpsertArgs).toMatchObject({
        where: {
          game_id_steam_api_name: {
            game_id: 'game-1',
            steam_api_name: 'ach_02',
          },
        },
        create: expect.objectContaining({ percent_global: null }),
        update: expect.objectContaining({ percent_global: null }),
      })

      const updateCalls = dbMock.mediaItem.update.mock.calls
      expect(updateCalls).toHaveLength(1)
      expect(updateCalls[0]![0]).toEqual({
        where: { id: 'game-1' },
        data: { achievement_sync_status: 'ok' },
      })
    },
    25_000,
  )

  it(
    'sets achievement_sync_status to private_profile and does not upsert achievements on 403',
    async () => {
      dbMock.mediaItem.findMany.mockResolvedValueOnce([
        { id: 'game-private', steam_app_id: 1942 },
      ])
      dbMock.achievement.upsert.mockResolvedValue({})
      dbMock.mediaItem.update.mockResolvedValue({})

      vi.stubGlobal(
        'fetch',
        vi
          .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
          .mockResolvedValueOnce(new Response('Forbidden', { status: 403 })),
      )

      const processor = processors.steamAchievementSync
      expect(processor).toBeDefined()

      worker = new Worker(
        TEST_QUEUE_NAME,
        async (job) => processor!(job),
        { connection: redis },
      )

      await new Promise<void>((resolve, reject) => {
        worker!.on('completed', () => resolve())
        worker!.on('failed', (_job, err) => reject(err))
        queue.add('manual', {}, { jobId: 'test-steam-private' })
      })

      expect(dbMock.achievement.upsert).not.toHaveBeenCalled()
      const updateCalls = dbMock.mediaItem.update.mock.calls
      expect(updateCalls).toHaveLength(1)
      expect(updateCalls[0]![0]).toEqual({
        where: { id: 'game-private' },
        data: { achievement_sync_status: 'private_profile' },
      })
    },
    25_000,
  )
})
