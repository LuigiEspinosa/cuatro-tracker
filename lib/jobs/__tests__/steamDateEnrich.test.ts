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
import { MediaType } from '@prisma/client'
import { RELEASE_DATE_SENTINEL } from '@/lib/normalise/release-date'
import { SIMILARITY_SCAN_QUEUE } from '@/lib/jobs/similarityScan'

// Mirrors lib/jobs/__tests__/similarityScan.test.ts: real Redis Queue / Worker
// with a mocked db, a mocked logger, and the IGDB adapter mocked so the job
// runs with zero external HTTP.
const dbMock = vi.hoisted(() => ({
  mediaItem: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
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

const igdbMock = vi.hoisted(() => ({
  mapSteamAppIdsToIgdbGameIds: vi.fn(),
  getGames: vi.fn(),
}))

// Spread the real module: lib/normalise/game.ts imports IgdbGameSchema from it,
// so a bare factory would strip the schema out from under the normaliser.
vi.mock('@/lib/api/igdb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/igdb')>()
  return {
    ...actual,
    mapSteamAppIdsToIgdbGameIds: igdbMock.mapSteamAppIdsToIgdbGameIds,
    getGames: igdbMock.getGames,
  }
})

const scanQueueMock = vi.hoisted(() => ({ add: vi.fn() }))

vi.mock('@/lib/jobs/queues', () => ({
  queues: [{ name: 'similarityScan', queue: scanQueueMock }],
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

// Portal 2: appid 620, IGDB game 72, first_release_date 2011-04-18.
const PORTAL_2_RELEASE = new Date('2011-04-18T00:00:00Z')

function steamRow(id: string, appId: number) {
  return { id, steam_app_id: appId }
}

const TEST_QUEUE_NAME = `test-steam-date-enrich-${Math.random().toString(36).slice(2, 10)}`

let redis: Redis
let steamDateEnrichProcessor: (job: Job) => Promise<unknown>

beforeAll(async () => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
  const redisMod = await import('@/lib/redis')
  redis = redisMod.redis
  const mod = await import('@/lib/jobs/steamDateEnrich')
  steamDateEnrichProcessor = mod.steamDateEnrichProcessor
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('steamDateEnrichProcessor (BullMQ integration, real Redis, mocked db + IGDB)', () => {
  let queue: Queue
  let worker: Worker | undefined

  beforeEach(async () => {
    queue = new Queue(TEST_QUEUE_NAME, { connection: redis })
    await queue.drain()
    vi.resetAllMocks()
    dbMock.mediaItem.update.mockResolvedValue({})
    scanQueueMock.add.mockResolvedValue({ id: 'scan_1' })
  })

  afterEach(async () => {
    if (worker) {
      await worker.close()
      worker = undefined
    }
    await queue.drain()
    await queue.close()
  })

  async function runJob(jobId: string, data: Record<string, unknown>) {
    // A test that runs two jobs must not leave the first worker consuming: two
    // live workers race for the next job and the second one's `completed`
    // listener never fires.
    if (worker) {
      await worker.close()
      worker = undefined
    }
    let result: unknown
    worker = new Worker(
      TEST_QUEUE_NAME,
      async (job) => {
        result = await steamDateEnrichProcessor(job)
        return result
      },
      { connection: redis },
    )

    await new Promise<void>((resolve, reject) => {
      worker!.on('completed', () => resolve())
      worker!.on('failed', (_job, err) => reject(err))
      queue.add('enrich', data, { jobId }).catch(reject)
    })

    return result
  }

  it(
    'writes release_date and nothing else for a mapped row with a real date',
    async () => {
      dbMock.mediaItem.findMany.mockResolvedValue([steamRow('m1', 620)])
      igdbMock.mapSteamAppIdsToIgdbGameIds.mockResolvedValue(
        new Map([[620, 72]]),
      )
      igdbMock.getGames.mockResolvedValue([
        { id: 72, name: 'Portal 2', first_release_date: 1303084800 },
      ])

      const result = await runJob('enrich-dates', { mediaItemIds: ['m1'] })

      expect(result).toEqual({
        scanned: 1,
        matched: 1,
        dated: 1,
        unmatched: 0,
        failed: 0,
      })
      // D5: release_date only. No igdb_id, no cover, no genres.
      expect(dbMock.mediaItem.update).toHaveBeenCalledWith({
        where: { id: 'm1' },
        data: { release_date: PORTAL_2_RELEASE },
      })
    },
    25_000,
  )

  it(
    'selects only sentinel-dated Steam rows, in both id-list and backfill mode',
    async () => {
      dbMock.mediaItem.findMany.mockResolvedValue([])
      igdbMock.mapSteamAppIdsToIgdbGameIds.mockResolvedValue(new Map())
      igdbMock.getGames.mockResolvedValue([])

      await runJob('enrich-where-ids', { mediaItemIds: ['m1'] })

      // The sentinel filter is in the WHERE clause even when a caller names
      // ids, so an id list can never overwrite a row that is already dated.
      expect(dbMock.mediaItem.findMany).toHaveBeenCalledWith({
        where: {
          type: MediaType.GAME,
          steam_app_id: { not: null, gt: 0 },
          release_date: RELEASE_DATE_SENTINEL,
          id: { in: ['m1'] },
        },
        select: { id: true, steam_app_id: true },
      })
    },
    25_000,
  )

  it(
    'omits the id filter when no ids are named (manual backfill)',
    async () => {
      dbMock.mediaItem.findMany.mockResolvedValue([])

      await runJob('enrich-where-backfill', {})

      expect(dbMock.mediaItem.findMany).toHaveBeenCalledWith({
        where: {
          type: MediaType.GAME,
          steam_app_id: { not: null, gt: 0 },
          release_date: RELEASE_DATE_SENTINEL,
        },
        select: { id: true, steam_app_id: true },
      })
    },
    25_000,
  )

  it(
    'rejects an empty id list rather than silently selecting nothing',
    async () => {
      dbMock.mediaItem.findMany.mockResolvedValue([])

      // An empty array is truthy, so without .min(1) this spreads
      // id: { in: [] } into the where clause, matches no rows and returns a
      // clean scanned: 0. That is the exact opposite of the backfill contract
      // the empty payload above carries, on the one path (a hand-built payload)
      // most likely to produce it, so the schema has to refuse it outright.
      await expect(
        runJob('enrich-empty-ids', { mediaItemIds: [] }),
      ).rejects.toThrow()
      expect(dbMock.mediaItem.findMany).not.toHaveBeenCalled()
    },
    25_000,
  )

  it(
    'leaves an unmapped row at the sentinel',
    async () => {
      dbMock.mediaItem.findMany.mockResolvedValue([
        steamRow('m1', 620),
        steamRow('m2', 9000001),
      ])
      igdbMock.mapSteamAppIdsToIgdbGameIds.mockResolvedValue(
        new Map([[620, 72]]),
      )
      igdbMock.getGames.mockResolvedValue([
        { id: 72, name: 'Portal 2', first_release_date: 1303084800 },
      ])

      const result = await runJob('enrich-unmapped', {})

      expect(result).toEqual({
        scanned: 2,
        matched: 1,
        dated: 1,
        unmatched: 1,
        failed: 0,
      })
      expect(dbMock.mediaItem.update).toHaveBeenCalledTimes(1)
      expect(dbMock.mediaItem.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'm2' } }),
      )
    },
    25_000,
  )

  it(
    'counts a mapped game with no usable date as matched but never writes it',
    async () => {
      dbMock.mediaItem.findMany.mockResolvedValue([steamRow('m1', 620)])
      igdbMock.mapSteamAppIdsToIgdbGameIds.mockResolvedValue(
        new Map([[620, 72]]),
      )
      // No first_release_date and no release_dates: computeIgdbReleaseDate
      // falls back to the sentinel, so the row must be left alone.
      igdbMock.getGames.mockResolvedValue([{ id: 72, name: 'Portal 2' }])

      const result = await runJob('enrich-undated', {})

      expect(result).toEqual({
        scanned: 1,
        matched: 1,
        dated: 0,
        unmatched: 0,
        failed: 0,
      })
      expect(dbMock.mediaItem.update).not.toHaveBeenCalled()
    },
    25_000,
  )

  it(
    'logs a per-row write failure and keeps going',
    async () => {
      dbMock.mediaItem.findMany.mockResolvedValue([
        steamRow('m1', 620),
        steamRow('m2', 440),
      ])
      igdbMock.mapSteamAppIdsToIgdbGameIds.mockResolvedValue(
        new Map([
          [620, 72],
          [440, 891],
        ]),
      )
      igdbMock.getGames.mockResolvedValue([
        { id: 72, name: 'Portal 2', first_release_date: 1303084800 },
        { id: 891, name: 'Team Fortress 2', first_release_date: 1192060800 },
      ])
      dbMock.mediaItem.update
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockResolvedValueOnce({})

      const result = await runJob('enrich-row-failure', {})

      expect(result).toEqual({
        scanned: 2,
        matched: 2,
        dated: 1,
        unmatched: 0,
        failed: 1,
      })
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'job.enrich.row_failed' }),
        expect.any(String),
      )
    },
    25_000,
  )

  it(
    'enqueues a rescan over exactly the dated ids and nothing when none were dated',
    async () => {
      dbMock.mediaItem.findMany.mockResolvedValue([
        steamRow('m1', 620),
        steamRow('m2', 9000001),
      ])
      igdbMock.mapSteamAppIdsToIgdbGameIds.mockResolvedValue(
        new Map([[620, 72]]),
      )
      igdbMock.getGames.mockResolvedValue([
        { id: 72, name: 'Portal 2', first_release_date: 1303084800 },
      ])

      // ! The job id here is the PRODUCTION shape: the bulk import enqueues
      // ! this job as steamDateEnrich:import:<importJobId>, which already
      // ! contains colons. A colon-free fixture here would let a five-part
      // ! rescan id ship, and BullMQ would reject it into the swallowing warn.
      await runJob('steamDateEnrich:import:job_1', {})

      expect(scanQueueMock.add).toHaveBeenCalledWith(
        'scan',
        // Only the dated row, and named as source: it is the disposable side,
        // and the accept route carries its Steam-only fields onto the survivor.
        { mediaItemIds: ['m1'], namedRole: 'source' },
        { jobId: `${SIMILARITY_SCAN_QUEUE}:enrich:steamDateEnrich-import-job_1` },
      )

      vi.resetAllMocks()
      dbMock.mediaItem.findMany.mockResolvedValue([])
      igdbMock.mapSteamAppIdsToIgdbGameIds.mockResolvedValue(new Map())
      igdbMock.getGames.mockResolvedValue([])

      await runJob('enrich-enqueue-none', {})

      expect(scanQueueMock.add).not.toHaveBeenCalled()
    },
    25_000,
  )

  it(
    'does not fail the committed enrichment when the rescan enqueue throws',
    async () => {
      dbMock.mediaItem.findMany.mockResolvedValue([steamRow('m1', 620)])
      igdbMock.mapSteamAppIdsToIgdbGameIds.mockResolvedValue(
        new Map([[620, 72]]),
      )
      igdbMock.getGames.mockResolvedValue([
        { id: 72, name: 'Portal 2', first_release_date: 1303084800 },
      ])
      scanQueueMock.add.mockRejectedValue(new Error('redis is down'))

      const result = await runJob('enrich-enqueue-fails', {})

      expect(result).toMatchObject({ dated: 1 })
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'job.enrich.scan_enqueue_failed' }),
        expect.any(String),
      )
    },
    25_000,
  )

  it(
    'builds a job id BullMQ actually accepts',
    async () => {
      // ! Has to run against a REAL Queue. BullMQ rejects a custom job id
      // ! containing a colon unless it splits into exactly three parts, and the
      // ! mocked queue above accepts anything, so the assertions in this suite
      // ! cannot catch a malformed id on their own. This is the literal id the
      // ! processor builds from a production enrich job id.
      const enrichJobId = 'steamDateEnrich:import:job_1'
      await expect(
        queue.add(
          'scan',
          { mediaItemIds: ['m1'], namedRole: 'source' },
          {
            jobId: `${SIMILARITY_SCAN_QUEUE}:enrich:${enrichJobId.split(':').join('-')}`,
          },
        ),
      ).resolves.toBeDefined()

      // The naive interpolation this replaced: five parts, rejected outright.
      await expect(
        queue.add(
          'scan',
          { mediaItemIds: ['m1'], namedRole: 'source' },
          { jobId: `${SIMILARITY_SCAN_QUEUE}:enrich:${enrichJobId}` },
        ),
      ).rejects.toThrow('Custom Id cannot contain :')
    },
    25_000,
  )
})
