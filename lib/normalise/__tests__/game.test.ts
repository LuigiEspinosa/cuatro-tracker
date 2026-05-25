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
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// Hades on PC: real IGDB id, realistic image_id, plausible Unix timestamp
// (2019-09-17 ~ Early Access launch). Builder lets each test override only
// the fields it cares about, mirroring `makeAnime` in anime.test.ts.
function makeIgdbGame(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1942,
    name: 'Hades',
    summary: 'A rogue-like dungeon crawler from the creators of Bastion.',
    first_release_date: 1568764800,
    cover: { id: 1, image_id: 'co1uii' },
    screenshots: [
      { id: 1, image_id: 'sc1' },
      { id: 2, image_id: 'sc2' },
    ],
    genres: [
      { id: 1, name: 'Action' },
      { id: 2, name: 'Indie' },
    ],
    platforms: [
      { id: 1, name: 'PC (Microsoft Windows)' },
      { id: 2, name: 'Nintendo Switch' },
    ],
    involved_companies: [
      {
        id: 1,
        company: { id: 1, name: 'Supergiant Games' },
        developer: true,
        publisher: true,
      },
    ],
    release_dates: [{ id: 1, y: 2020 }],
    ...overrides,
  }
}

describe('lib/normalise/game', () => {
  describe('happy path (IGDB-only)', () => {
    it('maps every primary field correctly', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(makeIgdbGame())

      expect(result).toMatchObject({
        type: MediaType.GAME,
        title: 'Hades',
        overview: 'A rogue-like dungeon crawler from the creators of Bastion.',
        poster_path: 'co1uii',
        screenshots: ['sc1', 'sc2'],
        genres: ['Action', 'Indie'],
        platforms: ['PC (Microsoft Windows)', 'Nintendo Switch'],
        developer_name: 'Supergiant Games',
        publisher_name: 'Supergiant Games',
        igdb_id: 1942,
      })
      expect(result.release_date).toBeInstanceOf(Date)
      expect((result.release_date as Date).getTime()).toBe(1568764800 * 1000)
      expect('steam_app_id' in result).toBe(false)
      expect('playtime_minutes' in result).toBe(false)
      expect('last_played' in result).toBe(false)
    })
  })

  describe('Steam cross-link', () => {
    it('populates steam_app_id, playtime_minutes, and last_played when steamMeta is provided', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(makeIgdbGame(), {
        appId: 1145360,
        playtime_forever: 4220,
        rtime_last_played: 1700000000,
      })

      expect(result.steam_app_id).toBe(1145360)
      expect(result.playtime_minutes).toBe(4220)
      expect(result.last_played).toBeInstanceOf(Date)
      expect((result.last_played as Date).getTime()).toBe(1700000000 * 1000)
    })

    it('coerces rtime_last_played === null to last_played: null', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(makeIgdbGame(), {
        appId: 1145360,
        playtime_forever: 0,
        rtime_last_played: null,
      })
      expect(result.last_played).toBeNull()
    })

    it('coerces rtime_last_played === 0 (Steam sentinel) to last_played: null', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(makeIgdbGame(), {
        appId: 1145360,
        playtime_forever: 0,
        rtime_last_played: 0,
      })
      expect(result.last_played).toBeNull()
    })

    it('defaults playtime_minutes to null when playtime_forever is undefined on steamMeta', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(makeIgdbGame(), { appId: 1145360 })
      expect(result.steam_app_id).toBe(1145360)
      expect(result.playtime_minutes).toBeNull()
      expect(result.last_played).toBeNull()
    })

    it('coerces negative playtime_forever to playtime_minutes: null (CHECK >= 0 guard)', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(makeIgdbGame(), {
        appId: 1145360,
        playtime_forever: -1,
        rtime_last_played: 0,
      })
      expect(result.playtime_minutes).toBeNull()
    })

    it('returns last_played: null when rtime_last_played overflows JS Date range', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(makeIgdbGame(), {
        appId: 1145360,
        playtime_forever: 0,
        // 1e15 seconds * 1000 = 1e18 ms, exceeds JS Date max (~8.64e15 ms).
        rtime_last_played: 1e15,
      })
      expect(result.last_played).toBeNull()
    })
  })

  describe('release-date fallback (NFR13)', () => {
    it('uses first_release_date when present and valid', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(makeIgdbGame())
      expect((result.release_date as Date).getTime()).toBe(1568764800 * 1000)
    })

    it('falls back to the year-only branch -> Jan 1 UTC when first_release_date is null', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(
        makeIgdbGame({
          first_release_date: null,
          release_dates: [{ id: 99, y: 2018 }],
        }),
      )
      const date = result.release_date as Date
      expect(date).toBeInstanceOf(Date)
      expect(date.getUTCFullYear()).toBe(2018)
      expect(date.getUTCMonth()).toBe(0)
      expect(date.getUTCDate()).toBe(1)
    })

    it('picks the earliest valid year when release_dates contains multiple regional entries', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(
        makeIgdbGame({
          first_release_date: null,
          release_dates: [
            { id: 1, y: 2020 }, // JP
            { id: 2, y: 2018 }, // NA - earliest valid
            { id: 3, y: 2019 }, // EU
          ],
        }),
      )
      const date = result.release_date as Date
      expect(date.getUTCFullYear()).toBe(2018)
    })

    it('skips y === 0 entries (IGDB unknown-year sentinel) and picks the earliest valid one', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(
        makeIgdbGame({
          first_release_date: null,
          release_dates: [
            { id: 1, y: 0 },
            { id: 2, y: 2021 },
            { id: 3, y: null },
          ],
        }),
      )
      const date = result.release_date as Date
      expect(date.getUTCFullYear()).toBe(2021)
    })

    it('falls through to 1970 sentinel when first_release_date is null and release_dates is empty', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(
        makeIgdbGame({ first_release_date: null, release_dates: [] }),
      )
      const date = result.release_date as Date
      expect(date.toISOString()).toBe('1970-01-01T00:00:00.000Z')
    })

    it('falls through to 1970 sentinel when every release_dates[].y is 0 or null', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(
        makeIgdbGame({
          first_release_date: null,
          release_dates: [
            { id: 1, y: 0 },
            { id: 2, y: null },
          ],
        }),
      )
      const date = result.release_date as Date
      expect(date.toISOString()).toBe('1970-01-01T00:00:00.000Z')
    })
  })

  describe('screenshots + image strategy (NFR15)', () => {
    it('stores screenshots as IGDB image_id strings only - never with the CDN prefix', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(makeIgdbGame())
      expect(result.screenshots).toEqual(['sc1', 'sc2'])
      for (const s of result.screenshots as string[]) {
        expect(s.startsWith('http')).toBe(false)
        expect(s.includes('images.igdb.com')).toBe(false)
      }
    })

    it('filters out empty-string image_ids from screenshots (broken-CDN-URL guard)', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(
        makeIgdbGame({
          screenshots: [
            { id: 1, image_id: 'sc1' },
            { id: 2, image_id: '' },
            { id: 3, image_id: 'sc3' },
          ],
        }),
      )
      expect(result.screenshots).toEqual(['sc1', 'sc3'])
    })

    it('returns poster_path: null when cover.image_id is an empty string', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(
        makeIgdbGame({
          cover: { id: 1, image_id: '' },
        }),
      )
      expect(result.poster_path).toBeNull()
    })
  })

  describe('developer/publisher selection', () => {
    it('returns null for both when no involved_company has developer or publisher true', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(
        makeIgdbGame({
          involved_companies: [
            {
              id: 1,
              company: { id: 1, name: 'Some Other Co' },
              developer: false,
              publisher: false,
            },
          ],
        }),
      )
      expect(result.developer_name).toBeNull()
      expect(result.publisher_name).toBeNull()
    })

    it('picks the first match when multiple companies are flagged', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(
        makeIgdbGame({
          involved_companies: [
            {
              id: 1,
              company: { id: 1, name: 'Publisher Only Co' },
              developer: false,
              publisher: true,
            },
            {
              id: 2,
              company: { id: 2, name: 'Real Developer Co' },
              developer: true,
              publisher: false,
            },
          ],
        }),
      )
      expect(result.developer_name).toBe('Real Developer Co')
      expect(result.publisher_name).toBe('Publisher Only Co')
    })
  })

  describe('array defaults', () => {
    it('returns [] for screenshots / genres / platforms when missing from input', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      const result = normaliseIgdbGame(
        makeIgdbGame({
          screenshots: undefined,
          genres: undefined,
          platforms: undefined,
        }),
      )
      expect(result.screenshots).toEqual([])
      expect(result.genres).toEqual([])
      expect(result.platforms).toEqual([])
    })
  })

  describe('malformed input', () => {
    it('throws a ZodError when id is not a number', async () => {
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      expect(() =>
        normaliseIgdbGame({ ...makeIgdbGame(), id: 'not-a-number' }),
      ).toThrow()
    })

    it('throws when name is missing', async () => {
      const game = makeIgdbGame() as Record<string, unknown>
      delete game.name
      const { normaliseIgdbGame } = await import('@/lib/normalise/game')
      expect(() => normaliseIgdbGame(game)).toThrow()
    })
  })

  describe('NFR13 invariant', () => {
    it.each([
      { label: 'first_release_date present', overrides: {} },
      {
        label: 'first_release_date === 0 (Unix epoch sentinel)',
        overrides: { first_release_date: 0, release_dates: [{ id: 1, y: 2021 }] },
      },
      {
        label: 'first_release_date null + year-only fallback',
        overrides: {
          first_release_date: null,
          release_dates: [{ id: 1, y: 2018 }],
        },
      },
      {
        label: 'first_release_date null + release_dates[].y null',
        overrides: {
          first_release_date: null,
          release_dates: [{ id: 1, y: null }],
        },
      },
      {
        label: 'first_release_date null + release_dates empty',
        overrides: { first_release_date: null, release_dates: [] },
      },
      {
        label: 'first_release_date null + release_dates missing entirely',
        overrides: { first_release_date: null, release_dates: undefined },
      },
    ])(
      'release_date is always a valid Date ($label)',
      async ({ overrides }) => {
        const { normaliseIgdbGame } = await import('@/lib/normalise/game')
        const result = normaliseIgdbGame(makeIgdbGame(overrides))
        expect(result.release_date).toBeInstanceOf(Date)
        expect(Number.isNaN((result.release_date as Date).getTime())).toBe(
          false,
        )
      },
    )
  })
})
