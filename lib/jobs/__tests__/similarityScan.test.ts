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
import { computeSimilarity, MERGE_SIMILARITY_THRESHOLD } from '@/lib/merge'
import { RELEASE_DATE_SENTINEL } from '@/lib/normalise/release-date'
import {
  findScanPairs,
  SIMILARITY_SCAN_QUEUE,
  type ScanCandidate,
} from '@/lib/jobs/similarityScan'

// Mirrors lib/jobs/__tests__/bulkImport.test.ts: real Redis Queue / Worker with
// a mocked db. The scan makes no external HTTP at all, so the whole processor
// flow (row load, candidate load, pair selection, suggestion write) runs
// deterministically. Mocking @/lib/db matches the repo-wide convention
// documented at bulkImport.test.ts:20-24.
const dbMock = vi.hoisted(() => ({
  mediaItem: {
    findMany: vi.fn(),
  },
  mergeSuggestion: {
    findFirst: vi.fn(),
    create: vi.fn(),
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

function utcYear(year: number): Date {
  return new Date(Date.UTC(year, 0, 1))
}

function candidate(
  id: string,
  title: string,
  year: number,
  type: MediaType = MediaType.GAME,
): ScanCandidate {
  return { id, title, release_date: utcYear(year), type }
}

describe('findScanPairs (pure)', () => {
  it('returns exactly the above-threshold pairs from a 10 by 100 sweep', () => {
    const newItems: ScanCandidate[] = [
      candidate('n1', 'Chrono Trigger', 1995),
      candidate('n2', 'Hollow Knight', 2017),
      candidate('n3', 'Disco Elysium', 2019),
      candidate('n4', 'Outer Wilds', 2019),
      candidate('n5', 'Return of the Obra Dinn', 2018),
      candidate('n6', 'Subnautica', 2018),
      candidate('n7', 'Factorio', 2020),
      candidate('n8', 'Terraria', 2011),
      candidate('n9', 'Stardew Valley', 2016),
      candidate('n10', 'Slay the Spire', 2019),
    ]

    // 100 unrelated existing rows plus 3 planted near-duplicates.
    const candidates: ScanCandidate[] = Array.from({ length: 100 }, (_, i) =>
      candidate(`e${i}`, `zzq filler ${i}`, 1980 + (i % 20)),
    )
    candidates.push(
      // Punctuation-only difference: normalises identical, same year.
      candidate('dup1', 'Chrono Trigger!', 1995),
      // Leading article: normaliseTitle drops it, same year.
      candidate('dup2', 'The Hollow Knight', 2017),
      // Exact title, one year off: 0.6 + 0.3 * 0.7 + 0.1 = 0.91.
      candidate('dup3', 'Outer Wilds', 2020),
      // Same title but a different media type: the hard type gate scores it 0.
      candidate('dup4', 'Factorio', 2020, MediaType.MOVIE),
      // Same title, 8 years apart: yearProximity is 0, so 0.7, below threshold.
      candidate('dup5', 'Subnautica', 2010),
    )

    const pairs = findScanPairs(newItems, candidates, 'source')

    expect(pairs).toHaveLength(3)
    expect(pairs.map((p) => [p.sourceId, p.targetId])).toEqual(
      expect.arrayContaining([
        ['n1', 'dup1'],
        ['n2', 'dup2'],
        ['n4', 'dup3'],
      ]),
    )
  })

  it('never pairs a row with itself', () => {
    const item = candidate('n1', 'Chrono Trigger', 1995)

    expect(findScanPairs([item], [item], 'source')).toEqual([])
  })

  it('excludes TV_EPISODE rows on both sides', () => {
    const newEpisode = candidate('n1', 'Pilot', 2019, MediaType.TV_EPISODE)
    const existingEpisode = candidate('e1', 'Pilot', 2019, MediaType.TV_EPISODE)
    const existingShow = candidate('e2', 'Pilot', 2019, MediaType.TV_SHOW)
    const newShow = candidate('n2', 'Pilot', 2019, MediaType.TV_SHOW)

    // Identical titles and years, so only the exclusion can suppress these.
    expect(computeSimilarity(newEpisode, existingEpisode)).toBe(1)
    expect(findScanPairs([newEpisode], [existingEpisode], 'source')).toEqual([])
    expect(findScanPairs([newEpisode], [existingShow], 'source')).toEqual([])
    expect(findScanPairs([newShow], [existingEpisode], 'source')).toEqual([])
    // The show-vs-show control still pairs, proving the fixtures are otherwise sound.
    expect(findScanPairs([newShow], [existingShow], 'source')).toHaveLength(1)
  })

  it('excludes pairs where either side has an unknown release date', () => {
    const sentinel = (id: string, title: string): ScanCandidate => ({
      id,
      title,
      release_date: new Date(RELEASE_DATE_SENTINEL),
      type: MediaType.GAME,
    })
    const steamA = sentinel('n1', 'Portal')
    const steamB = sentinel('e1', 'Portal 2')
    const datedIgdb = candidate('e2', 'Portal', 2007)

    // Both sides undated: yearProximity(sentinel, sentinel) is 1.0, so this
    // false pair would otherwise clear the threshold on prefix similarity alone.
    expect(computeSimilarity(steamA, steamB)).toBeGreaterThan(
      MERGE_SIMILARITY_THRESHOLD,
    )
    expect(findScanPairs([steamA], [steamB], 'source')).toEqual([])
    // One side undated: excluded too, even against an exact-title dated row.
    expect(findScanPairs([steamA], [datedIgdb], 'source')).toEqual([])
  })

  it('emits a new-vs-new pair once, not once per direction', () => {
    const a = candidate('n1', 'Chrono Trigger', 1995)
    const b = candidate('n2', 'Chrono Trigger!', 1995)

    // The processor loads candidates by type, so freshly imported rows appear on
    // both sides of the sweep.
    const pairs = findScanPairs([a, b], [a, b], 'source')

    expect(pairs).toHaveLength(1)
    expect(pairs[0]!.sourceId).toBe('n1')
    expect(pairs[0]!.targetId).toBe('n2')
  })

  it('returns the confidence computeSimilarity produces for the pair', () => {
    const item = candidate('n1', 'Outer Wilds', 2019)
    const existing = candidate('e1', 'Outer Wilds', 2020)

    const pairs = findScanPairs([item], [existing], 'source')

    expect(pairs[0]!.confidence).toBe(computeSimilarity(item, existing))
    expect(pairs[0]!.confidence).toBe(0.91)
  })

  it('puts the named items on the side namedRole selects', () => {
    const named = candidate('survivor', 'Chrono Trigger', 1995)
    const other = candidate('other', 'Chrono Trigger!', 1995)

    // The import caller names freshly imported duplicates, which belong on the
    // source side because accepting a suggestion deletes the source.
    const asSource = findScanPairs([named], [other], 'source')
    expect(asSource).toEqual([
      { sourceId: 'survivor', targetId: 'other', confidence: 1 },
    ])

    // The merge caller names the canonical survivor, which must be KEPT, so it
    // has to land on the target side. Same pair, opposite orientation.
    const asTarget = findScanPairs([named], [other], 'target')
    expect(asTarget).toEqual([
      { sourceId: 'other', targetId: 'survivor', confidence: 1 },
    ])
  })
})

const TEST_QUEUE_NAME = `test-similarity-scan-${Math.random().toString(36).slice(2, 10)}`

let redis: Redis
let similarityScanProcessor: (job: Job) => Promise<unknown>

beforeAll(async () => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
  const redisMod = await import('@/lib/redis')
  redis = redisMod.redis
  const mod = await import('@/lib/jobs/similarityScan')
  similarityScanProcessor = mod.similarityScanProcessor
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('similarityScanProcessor (BullMQ integration, real Redis, mocked db)', () => {
  let queue: Queue
  let worker: Worker | undefined

  const imported = candidate('n1', 'Chrono Trigger', 1995)
  const existing = candidate('e1', 'Chrono Trigger!', 1995)

  beforeEach(async () => {
    queue = new Queue(TEST_QUEUE_NAME, { connection: redis })
    await queue.drain()
    // resetAllMocks, not clearAllMocks: clear wipes call history but leaves the
    // mockResolvedValueOnce queue intact, so any test that does not consume both
    // entries would hand its leftovers to the next test as the wrong fixture.
    vi.resetAllMocks()
    dbMock.mediaItem.findMany
      .mockResolvedValueOnce([imported])
      .mockResolvedValueOnce([imported, existing])
  })

  afterEach(async () => {
    if (worker) {
      await worker.close()
      worker = undefined
    }
    await queue.drain()
    await queue.close()
  })

  async function runJob(jobId: string, mediaItemIds: string[]) {
    let result: unknown
    worker = new Worker(
      TEST_QUEUE_NAME,
      async (job) => {
        result = await similarityScanProcessor(job)
        return result
      },
      { connection: redis },
    )

    await new Promise<void>((resolve, reject) => {
      worker!.on('completed', () => resolve())
      worker!.on('failed', (_job, err) => reject(err))
      // .catch(reject), or an add-time rejection leaves this promise pending and
      // the real error surfaces as an unrelated 25s timeout.
      queue.add('scan', { mediaItemIds }, { jobId }).catch(reject)
    })

    return result
  }

  it(
    'creates a suggestion for an above-threshold pair',
    async () => {
      dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
      dbMock.mergeSuggestion.create.mockResolvedValue({ id: 'sug_1' })

      const result = await runJob('test-scan-create', ['n1'])

      expect(result).toEqual({
        scanned: 1,
        pairs: 1,
        created: 1,
        updated: 0,
        skipped: 0,
      })
      expect(dbMock.mergeSuggestion.create).toHaveBeenCalledWith({
        data: {
          // The newly imported row is the source (deleted on accept); the
          // pre-existing row is the target (kept, with the user's annotations).
          source_id: 'n1',
          target_id: 'e1',
          confidence: 1,
          resolved: false,
          dismissed: false,
        },
      })
      // One findMany for the batch, one for the candidates. Never one per row.
      expect(dbMock.mediaItem.findMany).toHaveBeenCalledTimes(2)
    },
    25_000,
  )

  it(
    're-running updates the pending suggestion instead of creating a second one',
    async () => {
      dbMock.mergeSuggestion.findFirst.mockResolvedValue({
        id: 'sug_1',
        resolved: false,
        dismissed: false,
      })

      const result = await runJob('test-scan-rerun', ['n1'])

      expect(result).toEqual({
        scanned: 1,
        pairs: 1,
        created: 0,
        updated: 1,
        skipped: 0,
      })
      expect(dbMock.mergeSuggestion.create).not.toHaveBeenCalled()
      // Confidence refreshed; the source / target roles are never flipped.
      expect(dbMock.mergeSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'sug_1' },
        data: { confidence: 1 },
      })
    },
    25_000,
  )

  it(
    'skips a dismissed pair without writing anything',
    async () => {
      dbMock.mergeSuggestion.findFirst.mockResolvedValue({
        id: 'sug_1',
        resolved: true,
        dismissed: true,
      })

      const result = await runJob('test-scan-dismissed', ['n1'])

      expect(result).toEqual({
        scanned: 1,
        pairs: 1,
        created: 0,
        updated: 0,
        skipped: 1,
      })
      expect(dbMock.mergeSuggestion.create).not.toHaveBeenCalled()
      expect(dbMock.mergeSuggestion.update).not.toHaveBeenCalled()
    },
    25_000,
  )

  it(
    'accepts the job ids both production callers build',
    async () => {
      // ! This has to run against a REAL Queue. BullMQ rejects a custom job id
      // ! containing a colon unless it splits into exactly three parts, and a
      // ! mocked queue accepts anything, so the mocked enqueue assertions in the
      // ! sibling suites cannot catch a malformed id. Both templates below are
      // ! the literal shapes bulkImport.ts and the merge route construct.
      await expect(
        queue.add(
          'scan',
          { mediaItemIds: ['n1'], namedRole: 'source' },
          { jobId: `${SIMILARITY_SCAN_QUEUE}:import:job_1` },
        ),
      ).resolves.toBeDefined()

      await expect(
        queue.add(
          'scan',
          { mediaItemIds: ['n1'], namedRole: 'target' },
          { jobId: `${SIMILARITY_SCAN_QUEUE}:merge:sug_1` },
        ),
      ).resolves.toBeDefined()
    },
    25_000,
  )

  it(
    'looks the pair up in either orientation',
    async () => {
      dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
      dbMock.mergeSuggestion.create.mockResolvedValue({ id: 'sug_1' })

      await runJob('test-scan-orientation', ['n1'])

      expect(dbMock.mergeSuggestion.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { source_id: 'n1', target_id: 'e1' },
              { source_id: 'e1', target_id: 'n1' },
            ],
          },
        }),
      )
    },
    25_000,
  )
})
