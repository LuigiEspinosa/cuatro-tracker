import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('getOwnedGames', () => {
  it('returns the parsed games array', async () => {
    const fetchSpy = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        jsonResponse({
          response: {
            game_count: 2,
            games: [
              {
                appid: 1942,
                name: 'The Witcher 3',
                playtime_forever: 3000,
                img_icon_url: 'abc',
                rtime_last_played: 1700000000,
              },
              {
                appid: 7,
                name: 'Half-Life 2',
                playtime_forever: 0,
              },
            ],
          },
        }),
    )
    vi.stubGlobal('fetch', fetchSpy)

    const { getOwnedGames } = await import('@/lib/api/steam')
    const games = await getOwnedGames('76561197960287930')

    expect(games).toHaveLength(2)
    expect(games[0]?.name).toBe('The Witcher 3')
    expect(games[1]?.playtime_forever).toBe(0)

    const [url] = fetchSpy.mock.calls[0]!
    expect(String(url)).toContain('/IPlayerService/GetOwnedGames/v0001/')
    expect(String(url)).toContain('key=steam-key')
    expect(String(url)).toContain('steamid=76561197960287930')
    expect(String(url)).toContain('include_appinfo=1')
  })

  it('returns empty array when response.games is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          jsonResponse({ response: {} }),
      ),
    )
    const { getOwnedGames } = await import('@/lib/api/steam')
    const games = await getOwnedGames('76561197960287930')
    expect(games).toEqual([])
  })
})

describe('getSchemaForGame', () => {
  it('returns the achievement schema array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          jsonResponse({
            game: {
              gameName: 'Witcher 3',
              availableGameStats: {
                achievements: [
                  {
                    name: 'ach_01',
                    displayName: 'First Steps',
                    description: 'Take your first step.',
                    icon: 'http://icon/01.png',
                    icongray: 'http://icon/01g.png',
                  },
                ],
              },
            },
          }),
      ),
    )

    const { getSchemaForGame } = await import('@/lib/api/steam')
    const schema = await getSchemaForGame('1942')
    expect(schema).toHaveLength(1)
    expect(schema[0]?.displayName).toBe('First Steps')
  })

  it('returns empty array when availableGameStats is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          jsonResponse({ game: { gameName: 'Bare Game' } }),
      ),
    )
    const { getSchemaForGame } = await import('@/lib/api/steam')
    expect(await getSchemaForGame('1942')).toEqual([])
  })
})

describe('getPlayerAchievements', () => {
  it('returns private_profile on 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response('Forbidden', { status: 403 }),
      ),
    )

    const { getPlayerAchievements } = await import('@/lib/api/steam')
    const result = await getPlayerAchievements('76561197960287930', '1942')
    expect(result).toEqual({ status: 'private_profile', appId: '1942' })
  })

  it('returns ok shape with empty achievements when playerstats.success is false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          jsonResponse({
            playerstats: {
              success: false,
              error: 'Requested app has no stats',
            },
          }),
      ),
    )

    const { getPlayerAchievements } = await import('@/lib/api/steam')
    const result = await getPlayerAchievements('76561197960287930', '99999')
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.achievements).toEqual([])
    }
  })

  it('merges player achievements with global percentages on 200', async () => {
    const fetchSpy = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      // 1st: GetPlayerAchievements
      .mockResolvedValueOnce(
        jsonResponse({
          playerstats: {
            steamID: '76561197960287930',
            gameName: 'Witcher 3',
            success: true,
            achievements: [
              { apiname: 'ach_01', achieved: 1, unlocktime: 1700000000 },
              { apiname: 'ach_02', achieved: 0, unlocktime: 0 },
              { apiname: 'ach_unknown_to_global', achieved: 1, unlocktime: 1700100000 },
            ],
          },
        }),
      )
      // 2nd: GetGlobalAchievementPercentagesForApp
      .mockResolvedValueOnce(
        jsonResponse({
          achievementpercentages: {
            achievements: [
              { name: 'ach_01', percent: 75.5 },
              { name: 'ach_02', percent: 30.0 },
            ],
          },
        }),
      )
    vi.stubGlobal('fetch', fetchSpy)

    const { getPlayerAchievements } = await import('@/lib/api/steam')
    const result = await getPlayerAchievements('76561197960287930', '1942')
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.achievements).toHaveLength(3)
      expect(result.achievements[0]).toEqual({
        steam_api_name: 'ach_01',
        unlocked: true,
        unlocked_at: new Date(1700000000 * 1000),
        percent_global: 75.5,
      })
      expect(result.achievements[1]).toEqual({
        steam_api_name: 'ach_02',
        unlocked: false,
        unlocked_at: null,
        percent_global: 30.0,
      })
      // Achievement absent from the global response gets null
      expect(result.achievements[2]?.percent_global).toBeNull()
      expect(result.achievements[2]?.unlocked).toBe(true)
    }
  })

  it('returns ok shape with null percent_global when global percentages 403', async () => {
    const fetchSpy = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        jsonResponse({
          playerstats: {
            success: true,
            achievements: [
              { apiname: 'ach_01', achieved: 1, unlocktime: 1700000000 },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(new Response('Forbidden', { status: 403 }))
    vi.stubGlobal('fetch', fetchSpy)

    const { getPlayerAchievements } = await import('@/lib/api/steam')
    const result = await getPlayerAchievements('76561197960287930', '1942')
    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.achievements[0]?.percent_global).toBeNull()
    }
  })

  it('throws SteamApiError on 401 (invalid API key)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          new Response('Unauthorized', { status: 401 }),
      ),
    )
    const { getPlayerAchievements, SteamApiError } = await import(
      '@/lib/api/steam'
    )
    await expect(
      getPlayerAchievements('76561197960287930', '1942'),
    ).rejects.toBeInstanceOf(SteamApiError)
    await expect(
      getPlayerAchievements('76561197960287930', '1942'),
    ).rejects.toMatchObject({ httpStatus: 401 })
  })
})

describe('retry on 429', () => {
  it('retries 429 with the same backoff schedule as 5xx', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response('slow down', {
          status: 429,
          headers: { 'Retry-After': '1' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          response: { game_count: 1, games: [{ appid: 1, name: 'Test', playtime_forever: 0 }] },
        }),
      )
    vi.stubGlobal('fetch', fetchSpy)

    const { getOwnedGames } = await import('@/lib/api/steam')
    const promise = getOwnedGames('76561197960287930')
    await vi.advanceTimersByTimeAsync(1500)
    const games = await promise
    expect(games).toHaveLength(1)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe('retry on 5xx', () => {
  it('retries 5xx with 1s/2s/4s backoff and surfaces final error', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response('err', { status: 503 }))
      .mockResolvedValueOnce(new Response('err', { status: 503 }))
      .mockResolvedValueOnce(new Response('err', { status: 503 }))
      .mockResolvedValueOnce(new Response('err', { status: 503 }))
    vi.stubGlobal('fetch', fetchSpy)

    const { getOwnedGames, SteamApiError } = await import('@/lib/api/steam')
    const promise = getOwnedGames('76561197960287930')
    const rejection = promise.catch((err) => err)

    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(2000)
    await vi.advanceTimersByTimeAsync(4000)
    const err = await rejection
    expect(err).toBeInstanceOf(SteamApiError)
    expect((err as InstanceType<typeof SteamApiError>).httpStatus).toBe(503)
    expect(fetchSpy).toHaveBeenCalledTimes(4)
  })
})

describe('parse failure', () => {
  it('surfaces fieldPath on a malformed Steam payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
          jsonResponse({
            response: {
              game_count: 1,
              games: [
                {
                  appid: 'not-a-number',
                  name: 'Bad Game',
                  playtime_forever: 0,
                },
              ],
            },
          }),
      ),
    )

    const { getOwnedGames, SteamApiError } = await import('@/lib/api/steam')
    try {
      await getOwnedGames('76561197960287930')
      expect.fail('expected parse failure')
    } catch (err) {
      expect(err).toBeInstanceOf(SteamApiError)
      const steamErr = err as InstanceType<typeof SteamApiError>
      expect(steamErr.fieldPath).toBe('response.games.0.appid')
    }
  })
})
