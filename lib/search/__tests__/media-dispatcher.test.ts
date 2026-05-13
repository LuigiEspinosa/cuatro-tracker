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

  it('returns null for every other (source, type) tuple in E4', async () => {
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

    for (const source of sources) {
      for (const type of types) {
        const dispatcher = getDispatcher(source, type)
        if (source === 'tmdb' && type === MediaType.MOVIE) {
          expect(dispatcher).not.toBeNull()
        } else {
          expect(dispatcher).toBeNull()
        }
      }
    }
  })
})
