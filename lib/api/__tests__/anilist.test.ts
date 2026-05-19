import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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
  NEXTAUTH_SECRET: 'a'.repeat(32),
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

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function mockFetchData(data: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  )
}

function mockFetchSequence(responses: Response[]) {
  let i = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      const r = responses[i] ?? responses[responses.length - 1]
      i += 1
      return r
    }),
  )
}

function makeMedia(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 170942,
    idMal: 52991,
    type: 'ANIME',
    format: 'TV',
    status: 'FINISHED',
    title: {
      romaji: 'Sousou no Frieren',
      english: 'Frieren: Beyond Journeys End',
      native: '葬送のフリーレン',
      userPreferred: 'Sousou no Frieren',
    },
    description: 'After defeating the Demon King...',
    startDate: { year: 2023, month: 9, day: 29 },
    endDate: { year: 2024, month: 3, day: 22 },
    season: 'FALL',
    seasonYear: 2023,
    episodes: 28,
    chapters: null,
    volumes: null,
    duration: 24,
    genres: ['Adventure', 'Drama', 'Fantasy'],
    averageScore: 90,
    popularity: 350000,
    coverImage: {
      extraLarge: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170942-x.jpg',
      large: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx170942-x.jpg',
      medium: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/bx170942-x.jpg',
      color: '#aee4f1',
    },
    bannerImage: 'https://s4.anilist.co/file/anilistcdn/media/anime/banner/170942-x.jpg',
    studios: {
      nodes: [{ id: 11, name: 'Madhouse', isAnimationStudio: true }],
    },
    source: 'MANGA',
    isAdult: false,
    ...overrides,
  }
}

describe('partialDateToDate', () => {
  it('builds full date from year/month/day', async () => {
    const { partialDateToDate } = await import('@/lib/api/anilist')
    const d = partialDateToDate(2020, 3, 15)
    expect(d).not.toBeNull()
    expect(d?.getFullYear()).toBe(2020)
    expect(d?.getMonth()).toBe(2)
    expect(d?.getDate()).toBe(15)
  })

  it('falls back day to 1 when null', async () => {
    const { partialDateToDate } = await import('@/lib/api/anilist')
    const d = partialDateToDate(2020, 3, null)
    expect(d?.getFullYear()).toBe(2020)
    expect(d?.getMonth()).toBe(2)
    expect(d?.getDate()).toBe(1)
  })

  it('falls back month to January (index 0) when null', async () => {
    const { partialDateToDate } = await import('@/lib/api/anilist')
    const d = partialDateToDate(2020, null, 15)
    expect(d?.getFullYear()).toBe(2020)
    expect(d?.getMonth()).toBe(0)
    expect(d?.getDate()).toBe(15)
  })

  it('falls back to Jan 1 when month and day are both null', async () => {
    const { partialDateToDate } = await import('@/lib/api/anilist')
    const d = partialDateToDate(2020, null, null)
    expect(d?.getFullYear()).toBe(2020)
    expect(d?.getMonth()).toBe(0)
    expect(d?.getDate()).toBe(1)
  })

  it('returns null when year is null (no anchor)', async () => {
    const { partialDateToDate } = await import('@/lib/api/anilist')
    expect(partialDateToDate(null, null, null)).toBeNull()
    expect(partialDateToDate(null, 3, 15)).toBeNull()
  })
})

describe('searchAnime', () => {
  it('returns parsed media array from Page.media on happy path', async () => {
    mockFetchData({
      Page: {
        pageInfo: { total: 1, perPage: 25, currentPage: 1, lastPage: 1, hasNextPage: false },
        media: [makeMedia()],
      },
    })
    const { searchAnime } = await import('@/lib/api/anilist')
    const results = await searchAnime('Frieren')
    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe(170942)
    expect(results[0]?.title.english).toContain('Frieren')
  })

  it('POSTs JSON with the configured User-Agent header', async () => {
    const fetchSpy = vi.fn(
      (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ data: { Page: { media: [] } } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchSpy)
    const { searchAnime } = await import('@/lib/api/anilist')
    await searchAnime('Frieren')

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] ?? []
    expect(url).toBe('https://graphql.anilist.co')
    expect(init).toBeDefined()
    if (!init) return
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(
      'cuatro-tracker/test',
    )
    const body = JSON.parse(String(init.body))
    expect(body.variables).toEqual({ search: 'Frieren', type: 'ANIME' })
    expect(body.query).toContain('Page(')
  })
})

describe('searchManga', () => {
  it('returns parsed manga media on happy path', async () => {
    const mangaFixture = makeMedia({
      id: 30002,
      type: 'MANGA',
      format: 'MANGA',
      title: {
        romaji: 'Berserk',
        english: 'Berserk',
        native: 'ベルセルク',
        userPreferred: 'Berserk',
      },
      episodes: null,
      chapters: 374,
      volumes: 41,
      season: null,
      seasonYear: null,
      duration: null,
      studios: undefined,
    })
    mockFetchData({ Page: { media: [mangaFixture] } })
    const { searchManga } = await import('@/lib/api/anilist')
    const results = await searchManga('Berserk')
    expect(results).toHaveLength(1)
    expect(results[0]?.type).toBe('MANGA')
    expect(results[0]?.chapters).toBe(374)
  })
})

describe('getMedia', () => {
  it('returns full Media payload with full startDate', async () => {
    mockFetchData({ Media: makeMedia() })
    const { getMedia } = await import('@/lib/api/anilist')
    const media = await getMedia(170942, 'ANIME')
    expect(media.id).toBe(170942)
    expect(media.startDate).toEqual({ year: 2023, month: 9, day: 29 })
  })

  it('preserves partial startDate where month and day are null', async () => {
    mockFetchData({
      Media: makeMedia({ startDate: { year: 2020, month: null, day: null } }),
    })
    const { getMedia, partialDateToDate } = await import('@/lib/api/anilist')
    const media = await getMedia(170942, 'ANIME')
    expect(media.startDate).toEqual({ year: 2020, month: null, day: null })

    const built = partialDateToDate(
      media.startDate.year,
      media.startDate.month,
      media.startDate.day,
    )
    expect(built?.toISOString().slice(0, 10)).toBe('2020-01-01')
  })

  it('throws AnilistApiError with field path on schema mismatch', async () => {
    mockFetchData({ Media: { ...makeMedia(), id: 'not-a-number' } })
    const { getMedia, AnilistApiError } = await import('@/lib/api/anilist')
    await expect(getMedia(170942, 'ANIME')).rejects.toBeInstanceOf(
      AnilistApiError,
    )
    await expect(getMedia(170942, 'ANIME')).rejects.toMatchObject({
      httpStatus: 200,
      fieldPath: expect.stringContaining('id'),
    })
  })
})

describe('getMediaRelations', () => {
  it('buckets relation edges into sequel / prequel / sideStory / parent / adaptation', async () => {
    const relationNode = (id: number, type: 'ANIME' | 'MANGA' = 'ANIME') => ({
      id,
      type,
      format: type === 'ANIME' ? 'TV' : 'MANGA',
      title: {
        romaji: `Title ${id}`,
        english: `Title ${id}`,
        native: `Title ${id}`,
        userPreferred: `Title ${id}`,
      },
      coverImage: { large: `https://s4.anilist.co/${id}.jpg` },
    })
    mockFetchData({
      Media: {
        id: 170942,
        relations: {
          edges: [
            { relationType: 'SEQUEL', node: relationNode(1) },
            { relationType: 'PREQUEL', node: relationNode(2) },
            { relationType: 'SIDE_STORY', node: relationNode(3) },
            { relationType: 'PARENT', node: relationNode(4) },
            { relationType: 'ADAPTATION', node: relationNode(5, 'MANGA') },
            { relationType: 'CHARACTER', node: relationNode(6) },
            { relationType: 'SPIN_OFF', node: relationNode(7) },
          ],
        },
      },
    })
    const { getMediaRelations } = await import('@/lib/api/anilist')
    const buckets = await getMediaRelations(170942)
    expect(buckets.sequel.map((n) => n.id)).toEqual([1])
    expect(buckets.prequel.map((n) => n.id)).toEqual([2])
    expect(buckets.sideStory.map((n) => n.id)).toEqual([3])
    expect(buckets.parent.map((n) => n.id)).toEqual([4])
    expect(buckets.adaptation.map((n) => n.id)).toEqual([5])
    // CHARACTER and SPIN_OFF are intentionally not surfaced.
  })
})

describe('rate limiting', () => {
  it('on 429 throws AnilistApiError with httpStatus 429 + retryAfterMs, and limiter releases for next call', async () => {
    mockFetchSequence([
      new Response('', {
        status: 429,
        headers: { 'Retry-After': '30' },
      }),
      new Response(
        JSON.stringify({ data: { Page: { media: [makeMedia()] } } }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    ])

    const { searchAnime, AnilistApiError } = await import('@/lib/api/anilist')

    let caught: unknown
    try {
      await searchAnime('Frieren')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(AnilistApiError)
    expect(caught).toMatchObject({
      httpStatus: 429,
      retryAfterMs: 30_000,
    })

    // Slot was released after the 429; a follow-up call must resolve.
    const ok = await searchAnime('Frieren')
    expect(ok).toHaveLength(1)
  })

  it('surfaces a GraphQL error envelope (200 with errors[]) as AnilistApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Response(
            JSON.stringify({
              errors: [
                { message: 'Internal Server Error', status: 500 },
              ],
              data: null,
            }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
      ),
    )
    const { searchAnime, AnilistApiError } = await import('@/lib/api/anilist')
    await expect(searchAnime('Frieren')).rejects.toBeInstanceOf(
      AnilistApiError,
    )
  })
})
