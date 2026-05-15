import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MediaType } from '@prisma/client'

const validEnv: Record<string, string> = {
  NEXTAUTH_SECRET: 'a'.repeat(32),
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
  LOG_LEVEL: 'info',
}

beforeEach(() => {
  vi.resetModules()
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('lib/search/media-dispatcher: getDispatcher', () => {
  it('returns a dispatcher for (tmdb, MOVIE)', async () => {
    const { getDispatcher } = await import('@/lib/search/media-dispatcher')

    const result = getDispatcher('tmdb', MediaType.MOVIE)

    expect(result).not.toBeNull()
    expect(result?.sourceIdKey).toBe('tmdb_id')
    expect(typeof result?.fetch).toBe('function')
    expect(typeof result?.normalise).toBe('function')
  })

  it("the (tmdb, MOVIE) dispatcher's fetch calls getMovie with the source ID", async () => {
    const { searchMulti: _ } = await import('@/lib/api/tmdb')
    const { getDispatcher } = await import('@/lib/search/media-dispatcher')
    const tmdb = await import('@/lib/api/tmdb')
    const spy = vi
      .spyOn(tmdb, 'getMovie')
      .mockResolvedValue({} as never)

    const dispatcher = getDispatcher('tmdb', MediaType.MOVIE)
    await dispatcher?.fetch(550)

    expect(spy).toHaveBeenCalledWith(550)
  })

  it('returns a dispatcher for (tmdb, TV_SHOW)', async () => {
    const { getDispatcher } = await import('@/lib/search/media-dispatcher')

    const result = getDispatcher('tmdb', MediaType.TV_SHOW)

    expect(result).not.toBeNull()
    expect(result?.sourceIdKey).toBe('tmdb_id')
    expect(typeof result?.fetch).toBe('function')
    expect(typeof result?.normalise).toBe('function')
  })

  it("the (tmdb, TV_SHOW) dispatcher's fetch calls getTv plus getTvSeason for each populated season", async () => {
    const { getDispatcher } = await import('@/lib/search/media-dispatcher')
    const tmdb = await import('@/lib/api/tmdb')
    const getTvSpy = vi.spyOn(tmdb, 'getTv').mockResolvedValue({
      id: 1396,
      seasons: [
        { season_number: 1, episode_count: 7 },
        { season_number: 2, episode_count: 13 },
      ],
    } as never)
    const getSeasonSpy = vi
      .spyOn(tmdb, 'getTvSeason')
      .mockResolvedValue({ episodes: [] } as never)

    const dispatcher = getDispatcher('tmdb', MediaType.TV_SHOW)
    const result = (await dispatcher?.fetch(1396)) as {
      show: unknown
      seasons: unknown[]
    }

    expect(getTvSpy).toHaveBeenCalledWith(1396)
    expect(getSeasonSpy).toHaveBeenCalledTimes(2)
    expect(getSeasonSpy).toHaveBeenCalledWith(1396, 1)
    expect(getSeasonSpy).toHaveBeenCalledWith(1396, 2)
    expect(result.seasons).toHaveLength(2)
  })

  it("the (tmdb, TV_SHOW) dispatcher's fetch SKIPS seasons with episode_count === 0", async () => {
    const { getDispatcher } = await import('@/lib/search/media-dispatcher')
    const tmdb = await import('@/lib/api/tmdb')
    vi.spyOn(tmdb, 'getTv').mockResolvedValue({
      id: 1396,
      seasons: [
        { season_number: 1, episode_count: 7 },
        { season_number: 2, episode_count: 0 }, // unaired future season
        { season_number: 3, episode_count: 10 },
      ],
    } as never)
    const getSeasonSpy = vi
      .spyOn(tmdb, 'getTvSeason')
      .mockResolvedValue({ episodes: [] } as never)

    const dispatcher = getDispatcher('tmdb', MediaType.TV_SHOW)
    await dispatcher?.fetch(1396)

    expect(getSeasonSpy).toHaveBeenCalledTimes(2)
    expect(getSeasonSpy).toHaveBeenCalledWith(1396, 1)
    expect(getSeasonSpy).toHaveBeenCalledWith(1396, 3)
    expect(getSeasonSpy).not.toHaveBeenCalledWith(1396, 2)
  })

  it("the (tmdb, TV_SHOW) dispatcher's fetch INCLUDES Specials (season_number: 0) when episode_count > 0", async () => {
    const { getDispatcher } = await import('@/lib/search/media-dispatcher')
    const tmdb = await import('@/lib/api/tmdb')
    vi.spyOn(tmdb, 'getTv').mockResolvedValue({
      id: 1396,
      seasons: [
        { season_number: 0, episode_count: 4 }, // Specials
        { season_number: 1, episode_count: 7 },
      ],
    } as never)
    const getSeasonSpy = vi
      .spyOn(tmdb, 'getTvSeason')
      .mockResolvedValue({ episodes: [] } as never)

    const dispatcher = getDispatcher('tmdb', MediaType.TV_SHOW)
    await dispatcher?.fetch(1396)

    expect(getSeasonSpy).toHaveBeenCalledTimes(2)
    expect(getSeasonSpy).toHaveBeenCalledWith(1396, 0)
    expect(getSeasonSpy).toHaveBeenCalledWith(1396, 1)
  })

  it("the (tmdb, TV_SHOW) dispatcher's fetch tolerates a missing `seasons` array (yields zero parallel calls)", async () => {
    const { getDispatcher } = await import('@/lib/search/media-dispatcher')
    const tmdb = await import('@/lib/api/tmdb')
    vi.spyOn(tmdb, 'getTv').mockResolvedValue({
      id: 1396,
      // `seasons` omitted on purpose — TmdbTvSchema declares it optional.
    } as never)
    const getSeasonSpy = vi
      .spyOn(tmdb, 'getTvSeason')
      .mockResolvedValue({ episodes: [] } as never)

    const dispatcher = getDispatcher('tmdb', MediaType.TV_SHOW)
    const result = (await dispatcher?.fetch(1396)) as { seasons: unknown[] }

    expect(getSeasonSpy).not.toHaveBeenCalled()
    expect(result.seasons).toEqual([])
  })

  it('returns null for every unwired (source, type) tuple', async () => {
    const { getDispatcher } = await import('@/lib/search/media-dispatcher')

    const sources = ['tmdb', 'anilist', 'igdb', 'steam'] as const
    const types: MediaType[] = [
      MediaType.MOVIE,
      MediaType.TV_SHOW,
      MediaType.TV_EPISODE,
      MediaType.ANIME,
      MediaType.MANGA,
      MediaType.GAME,
    ]

    const wired = new Set([
      `tmdb:${MediaType.MOVIE}`,
      `tmdb:${MediaType.TV_SHOW}`,
    ])

    for (const source of sources) {
      for (const type of types) {
        const dispatcher = getDispatcher(source, type)
        if (wired.has(`${source}:${type}`)) {
          expect(dispatcher).not.toBeNull()
        } else {
          expect(dispatcher).toBeNull()
        }
      }
    }
  })
})
