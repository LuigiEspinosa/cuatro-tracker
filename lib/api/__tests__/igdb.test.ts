import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const loggerMock = vi.hoisted(() => ({
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
}))

const redisStore = vi.hoisted(() => new Map<string, string>())
const makeMultiChain = vi.hoisted(() => () => {
  type SetArgs =
    | [string, string]
    | [string, string, string, number]
  const ops: Array<{ key: string; args: SetArgs }> = []
  const chain = {
    set(...args: SetArgs) {
      ops.push({ key: args[0], args })
      return chain
    },
    async exec() {
      for (const op of ops) {
        redisStore.set(op.key, op.args[1])
      }
      return ops.map(() => [null, 'OK'])
    },
  }
  return chain
})
const redisMock = vi.hoisted(() => ({
  get: vi.fn(async (key: string) => redisStore.get(key) ?? null),
  set: vi.fn(
    async (
      key: string,
      value: string,
      _expiryToken?: string,
      _ttlSeconds?: number,
    ) => {
      redisStore.set(key, value)
      return 'OK'
    },
  ),
  del: vi.fn(async (...keys: string[]) => {
    let removed = 0
    for (const k of keys) {
      if (redisStore.delete(k)) removed++
    }
    return removed
  }),
  multi: vi.fn(() => makeMultiChain()),
}))

vi.mock('@/lib/logger', () => ({
  logger: loggerMock,
  createLogger: () => loggerMock,
}))

vi.mock('@/lib/redis', () => ({
  redis: redisMock,
  closeRedis: vi.fn(async () => {}),
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

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function seedFreshToken(): void {
  redisStore.set('igdb:token', 'cached-token')
  redisStore.set(
    'igdb:token:expiresAt',
    String(Date.now() + 30 * 24 * 60 * 60 * 1000),
  )
}

function makeGame(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1942,
    name: 'The Witcher 3: Wild Hunt',
    summary: 'Open-world action RPG.',
    first_release_date: 1431993600,
    cover: { id: 99, image_id: 'co1uii' },
    screenshots: [{ id: 1, image_id: 'sc1' }],
    genres: [{ id: 5, name: 'Role-playing (RPG)' }],
    platforms: [{ id: 6, name: 'PC (Microsoft Windows)' }],
    involved_companies: [
      {
        id: 1,
        company: { id: 1, name: 'CD Projekt RED' },
        developer: true,
        publisher: false,
      },
    ],
    release_dates: [{ id: 1, y: 2015 }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  redisStore.clear()
  // Re-bind the mock implementations after resetAllMocks wipes them.
  redisMock.get.mockImplementation(async (key: string) => redisStore.get(key) ?? null)
  redisMock.set.mockImplementation(
    async (key: string, value: string) => {
      redisStore.set(key, value)
      return 'OK'
    },
  )
  redisMock.del.mockImplementation(async (...keys: string[]) => {
    let removed = 0
    for (const k of keys) {
      if (redisStore.delete(k)) removed++
    }
    return removed
  })
  redisMock.multi.mockImplementation(() => makeMultiChain())
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('searchGames + getGame happy path', () => {
  it('searchGames returns parsed games when token is fresh', async () => {
    seedFreshToken()
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse([makeGame()]),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { searchGames } = await import('@/lib/api/igdb')
    const games = await searchGames('witcher')

    expect(games).toHaveLength(1)
    expect(games[0]?.name).toBe('The Witcher 3: Wild Hunt')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('https://api.igdb.com/v4/games')
    expect((init as RequestInit | undefined)?.method).toBe('POST')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['Client-ID']).toBe('igdb-id')
    expect(headers.Authorization).toBe('Bearer cached-token')
    expect((init as RequestInit).body).toContain('search "witcher"')
    expect((init as RequestInit).body).toContain('limit 25')
  })

  it('getGame returns the first game when one matches', async () => {
    seedFreshToken()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([makeGame()])))

    const { getGame } = await import('@/lib/api/igdb')
    const game = await getGame(1942)
    expect(game.id).toBe(1942)
    expect(game.cover?.image_id).toBe('co1uii')
  })

  it('getGame throws IgdbApiError with httpStatus 404 when no game matches', async () => {
    seedFreshToken()
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([])))

    const { getGame, IgdbApiError } = await import('@/lib/api/igdb')
    await expect(getGame(999999)).rejects.toBeInstanceOf(IgdbApiError)
    await expect(getGame(999999)).rejects.toMatchObject({
      httpStatus: 404,
      endpoint: 'games/999999',
    })
  })
})

describe('refreshIgdbToken', () => {
  it('POSTs to Twitch with grant_type=client_credentials and persists token + expiresAt', async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({
          access_token: 'fresh-token',
          expires_in: 5184000,
          token_type: 'bearer',
        }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { refreshIgdbToken } = await import('@/lib/api/igdb')
    const before = Date.now()
    const { token, expiresAt } = await refreshIgdbToken()

    expect(token).toBe('fresh-token')
    expect(expiresAt).toBeGreaterThanOrEqual(before + 5184000 * 1000 - 5)

    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('https://id.twitch.tv/oauth2/token')
    expect((init as RequestInit | undefined)?.method).toBe('POST')
    const headers = (init as RequestInit).headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    const body = (init as RequestInit).body
    expect(body).toBeInstanceOf(URLSearchParams)
    const bodyParams = body as URLSearchParams
    expect(bodyParams.get('client_id')).toBe('igdb-id')
    expect(bodyParams.get('client_secret')).toBe('igdb-secret')
    expect(bodyParams.get('grant_type')).toBe('client_credentials')

    expect(redisStore.get('igdb:token')).toBe('fresh-token')
    expect(redisStore.get('igdb:token:expiresAt')).toMatch(/^\d+$/)
  })

  it('triggers a refresh when expiresAt is within the 24h threshold', async () => {
    redisStore.set('igdb:token', 'stale-token')
    redisStore.set(
      'igdb:token:expiresAt',
      String(Date.now() + 60 * 60 * 1000),
    )

    const fetchSpy = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      // 1st call: Twitch token refresh
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'rotated',
          expires_in: 5184000,
          token_type: 'bearer',
        }),
      )
      // 2nd call: actual IGDB request
      .mockResolvedValueOnce(jsonResponse([makeGame()]))
    vi.stubGlobal('fetch', fetchSpy)

    const { getGame } = await import('@/lib/api/igdb')
    await getGame(1942)

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(String(fetchSpy.mock.calls[0]![0])).toContain(
      'id.twitch.tv/oauth2/token',
    )
    expect(String(fetchSpy.mock.calls[1]![0])).toBe(
      'https://api.igdb.com/v4/games',
    )
    const igdbHeaders = (fetchSpy.mock.calls[1]![1] as RequestInit)
      .headers as Record<string, string>
    expect(igdbHeaders.Authorization).toBe('Bearer rotated')
  })

  it('rejects with IgdbApiError when Twitch returns 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthorized', { status: 401 })),
    )

    const { refreshIgdbToken, IgdbApiError } = await import('@/lib/api/igdb')
    await expect(refreshIgdbToken()).rejects.toBeInstanceOf(IgdbApiError)
    await expect(refreshIgdbToken()).rejects.toMatchObject({
      httpStatus: 401,
      endpoint: 'twitch/oauth2/token',
    })
  })

  it('parse failure surfaces fieldPath in the IgdbApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          access_token: '',
          expires_in: 5184000,
          token_type: 'bearer',
        }),
      ),
    )

    const { refreshIgdbToken, IgdbApiError } = await import('@/lib/api/igdb')
    try {
      await refreshIgdbToken()
      expect.fail('refreshIgdbToken should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(IgdbApiError)
      const igdbErr = err as InstanceType<typeof IgdbApiError>
      expect(igdbErr.fieldPath).toBe('access_token')
    }
  })
})

describe('retry + backoff on 5xx and 429', () => {
  it('retries on 5xx with 1s, 2s, 4s backoff (3 attempts before throwing)', async () => {
    seedFreshToken()
    vi.useFakeTimers()
    const fetchSpy = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
      .mockResolvedValueOnce(new Response('boom', { status: 500 }))
    vi.stubGlobal('fetch', fetchSpy)

    const { getGame, IgdbApiError } = await import('@/lib/api/igdb')
    const promise = getGame(1942)
    // Catch eagerly so the unhandled-rejection guard does not fire while we
    // crank the fake clock through the backoff schedule.
    const rejection = promise.catch((err) => err)

    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(4000)
    const err = await rejection
    expect(err).toBeInstanceOf(IgdbApiError)
    expect((err as InstanceType<typeof IgdbApiError>).httpStatus).toBe(500)
    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })

  it('429 with Retry-After honours the header when greater than the base backoff', async () => {
    seedFreshToken()
    vi.useFakeTimers()
    const fetchSpy = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response('slow down', {
          status: 429,
          headers: { 'Retry-After': '2' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse([makeGame()]))
    vi.stubGlobal('fetch', fetchSpy)

    const { getGame } = await import('@/lib/api/igdb')
    const promise = getGame(1942)

    // Base attempt 0 backoff is 1000ms; Retry-After header is 2000ms; the
    // adapter waits the larger of the two before retrying.
    await vi.advanceTimersByTimeAsync(1500)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(700)
    const game = await promise
    expect(game.id).toBe(1942)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe('parse failures', () => {
  it('throws IgdbApiError with fieldPath when a games array is malformed', async () => {
    seedFreshToken()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse([
          {
            ...makeGame(),
            name: 12345,
          },
        ]),
      ),
    )

    const { getGame, IgdbApiError } = await import('@/lib/api/igdb')
    try {
      await getGame(1942)
      expect.fail('expected parse failure')
    } catch (err) {
      expect(err).toBeInstanceOf(IgdbApiError)
      const igdbErr = err as InstanceType<typeof IgdbApiError>
      expect(igdbErr.fieldPath).toBe('0.name')
      expect(igdbErr.endpoint).toBe('games/1942')
    }
  })
})

describe('IGDB 401 token-invalidation retry', () => {
  it('invalidates the cached token and retries once on a 401 from IGDB', async () => {
    seedFreshToken()
    const fetchSpy = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      // 1st: IGDB games call returns 401 (stale token)
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      // 2nd: Twitch token refresh returns a new token
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'rotated-after-401',
            expires_in: 5184000,
            token_type: 'bearer',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      // 3rd: IGDB games call succeeds with the new token
      .mockResolvedValueOnce(
        new Response(JSON.stringify([makeGame()]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchSpy)

    const { getGame } = await import('@/lib/api/igdb')
    const game = await getGame(1942)
    expect(game.id).toBe(1942)
    expect(fetchSpy).toHaveBeenCalledTimes(3)

    // The 1st and 3rd calls hit IGDB; the 2nd hits Twitch.
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      'https://api.igdb.com/v4/games',
    )
    expect(String(fetchSpy.mock.calls[1]![0])).toBe(
      'https://id.twitch.tv/oauth2/token',
    )
    expect(String(fetchSpy.mock.calls[2]![0])).toBe(
      'https://api.igdb.com/v4/games',
    )
  })

  it('does not retry a second time when the refresh-then-retry also returns 401', async () => {
    seedFreshToken()
    const fetchSpy = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'still-rejected',
            expires_in: 5184000,
            token_type: 'bearer',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }))
    vi.stubGlobal('fetch', fetchSpy)

    const { getGame, IgdbApiError } = await import('@/lib/api/igdb')
    try {
      await getGame(1942)
      expect.fail('expected getGame to throw on persistent 401')
    } catch (err) {
      expect(err).toBeInstanceOf(IgdbApiError)
      expect((err as InstanceType<typeof IgdbApiError>).httpStatus).toBe(401)
    }
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })
})

describe('searchGames empty-query guard', () => {
  it('returns [] without calling fetch when the query is empty / whitespace', async () => {
    seedFreshToken()
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse([makeGame()]),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { searchGames } = await import('@/lib/api/igdb')
    expect(await searchGames('')).toEqual([])
    expect(await searchGames('   ')).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('clamps an out-of-range limit to IGDB`s [1, 500] window', async () => {
    seedFreshToken()
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse([makeGame()]),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { searchGames } = await import('@/lib/api/igdb')
    await searchGames('witcher', { limit: 9999 })
    expect((fetchSpy.mock.calls[0]![1] as RequestInit).body).toContain(
      'limit 500',
    )

    await searchGames('witcher', { limit: 0 })
    expect((fetchSpy.mock.calls[1]![1] as RequestInit).body).toContain(
      'limit 1',
    )
  })
})

describe('slot-limited concurrency', () => {
  it('caps in-flight IGDB requests at 4 and queues the rest', async () => {
    seedFreshToken()

    // Each call to fetch returns a deferred Promise; we control resolution
    // order so we can assert that fetch is invoked at most 4 times until a
    // slot frees, then a 5th time.
    const deferreds: Array<{
      resolve: (r: Response) => void
      reject: (e: unknown) => void
    }> = []
    const fetchSpy = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          deferreds.push({ resolve, reject })
        }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { getGame } = await import('@/lib/api/igdb')
    const results = Promise.all([
      getGame(1),
      getGame(2),
      getGame(3),
      getGame(4),
      getGame(5),
      getGame(6),
    ])
    // Surface unhandled-rejection noise as a no-op for the duration of the
    // test; the resolved games array below is the success path.
    const settled = results.catch(() => null)

    // Flush microtasks so getGame -> withIgdbLimit -> getIgdbToken ->
    // igdbFetch -> fetch all execute up to the awaited fetch.
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))

    expect(fetchSpy).toHaveBeenCalledTimes(4)

    // Resolve the first deferred — that frees one slot, releasing the queued
    // 5th call into fetch.
    deferreds[0]!.resolve(jsonResponse([makeGame({ id: 1 })]))
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))
    expect(fetchSpy).toHaveBeenCalledTimes(5)

    deferreds[1]!.resolve(jsonResponse([makeGame({ id: 2 })]))
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setImmediate(r))
    expect(fetchSpy).toHaveBeenCalledTimes(6)

    // Drain the remaining deferreds so the test does not hang.
    deferreds[2]!.resolve(jsonResponse([makeGame({ id: 3 })]))
    deferreds[3]!.resolve(jsonResponse([makeGame({ id: 4 })]))
    deferreds[4]!.resolve(jsonResponse([makeGame({ id: 5 })]))
    deferreds[5]!.resolve(jsonResponse([makeGame({ id: 6 })]))
    await settled
  })
})
