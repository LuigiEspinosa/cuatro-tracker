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

function makeAnime(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 170942,
    idMal: 52991,
    type: 'ANIME',
    format: 'TV',
    status: 'FINISHED',
    title: {
      romaji: 'Sousou no Frieren',
      english: 'Frieren Beyond Journeys End',
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
      extraLarge:
        'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170942-x.jpg',
      large:
        'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/bx170942-x.jpg',
      medium:
        'https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/bx170942-x.jpg',
      color: '#aee4f1',
    },
    bannerImage:
      'https://s4.anilist.co/file/anilistcdn/media/anime/banner/170942-x.jpg',
    studios: {
      nodes: [
        { id: 11, name: 'Madhouse', isAnimationStudio: true },
        { id: 2, name: 'Aniplex', isAnimationStudio: false },
      ],
    },
    source: 'MANGA',
    isAdult: false,
    ...overrides,
  }
}

describe('lib/normalise/anime', () => {
  describe('happy path', () => {
    it('maps every documented field correctly', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')

      const result = normaliseAnilistAnime(makeAnime())

      expect(result).toMatchObject({
        type: MediaType.ANIME,
        title: 'Sousou no Frieren',
        original_title: '葬送のフリーレン',
        overview: 'After defeating the Demon King...',
        poster_path:
          'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170942-x.jpg',
        backdrop_path:
          'https://s4.anilist.co/file/anilistcdn/media/anime/banner/170942-x.jpg',
        rating: 90,
        popularity: 350000,
        genres: ['Adventure', 'Drama', 'Fantasy'],
        status: 'FINISHED',
        episode_count: 28,
        format: 'TV',
        studio_name: 'Madhouse',
        season: 'FALL',
        season_year: 2023,
        source_material: 'MANGA',
        anilist_id: 170942,
      })
      expect(result.release_date).toBeInstanceOf(Date)
      // UTC getters: partialDateToDate now anchors via Date.UTC so the
      // result is TZ-independent (ECH-8-2-1 fix).
      expect((result.release_date as Date).getUTCFullYear()).toBe(2023)
      expect((result.release_date as Date).getUTCMonth()).toBe(8) // September is 8 (0-indexed)
      expect((result.release_date as Date).getUTCDate()).toBe(29)
    })
  })

  describe('title fallback chain', () => {
    it('honours userPreferred when present (locale-aware default)', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')
      const result = normaliseAnilistAnime(
        makeAnime({
          title: {
            romaji: 'Romaji X',
            english: 'English X',
            native: 'Native X',
            userPreferred: 'Preferred X',
          },
        }),
      )
      expect(result.title).toBe('Preferred X')
    })

    it('falls back to romaji when userPreferred missing', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')
      const result = normaliseAnilistAnime(
        makeAnime({
          title: {
            romaji: 'Romaji X',
            english: 'English X',
            native: 'Native X',
            userPreferred: null,
          },
        }),
      )
      expect(result.title).toBe('Romaji X')
    })

    it('falls back to english when romaji null', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')
      const result = normaliseAnilistAnime(
        makeAnime({
          title: {
            romaji: null,
            english: 'English X',
            native: 'Native X',
            userPreferred: null,
          },
        }),
      )
      expect(result.title).toBe('English X')
    })

    it('falls back to native when romaji and english both null', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')
      const result = normaliseAnilistAnime(
        makeAnime({
          title: {
            romaji: null,
            english: null,
            native: 'Native X',
            userPreferred: null,
          },
        }),
      )
      expect(result.title).toBe('Native X')
    })
  })

  describe('partial-date handling (NFR13 + NFR14)', () => {
    it('builds Jan 1 from year-only startDate', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')
      const result = normaliseAnilistAnime(
        makeAnime({ startDate: { year: 2020, month: null, day: null } }),
      )
      const date = result.release_date as Date
      expect(date).toBeInstanceOf(Date)
      expect(date.getUTCFullYear()).toBe(2020)
      expect(date.getUTCMonth()).toBe(0)
      expect(date.getUTCDate()).toBe(1)
      expect(Number.isNaN(date.getTime())).toBe(false)
    })

    it('builds month/Jan 1 when only year+month present', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')
      const result = normaliseAnilistAnime(
        makeAnime({ startDate: { year: 2020, month: 6, day: null } }),
      )
      const date = result.release_date as Date
      expect(date.getUTCFullYear()).toBe(2020)
      expect(date.getUTCMonth()).toBe(5) // June
      expect(date.getUTCDate()).toBe(1)
    })

    it('falls through to 1970 sentinel when year is null (all-null fuzzy date)', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')
      const result = normaliseAnilistAnime(
        makeAnime({ startDate: { year: null, month: null, day: null } }),
      )
      const date = result.release_date as Date
      expect(date).toBeInstanceOf(Date)
      expect(Number.isNaN(date.getTime())).toBe(false)
      expect(date.toISOString()).toBe('1970-01-01T00:00:00.000Z')
    })

    it('keeps NFR13 invariant for every fixture variant', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')
      const variants = [
        makeAnime(),
        makeAnime({ startDate: { year: 2020, month: null, day: null } }),
        makeAnime({ startDate: { year: null, month: null, day: null } }),
        makeAnime({ endDate: undefined }),
      ]
      for (const variant of variants) {
        const result = normaliseAnilistAnime(variant)
        expect(result.release_date).toBeInstanceOf(Date)
        expect(
          Number.isNaN((result.release_date as Date).getTime()),
        ).toBe(false)
      }
    })
  })

  describe('studio selection', () => {
    it('picks first studio flagged isAnimationStudio = true', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')
      const result = normaliseAnilistAnime(
        makeAnime({
          studios: {
            nodes: [
              { id: 100, name: 'Producer Co', isAnimationStudio: false },
              { id: 200, name: 'Real Animation Inc', isAnimationStudio: true },
              { id: 300, name: 'Another Animation', isAnimationStudio: true },
            ],
          },
        }),
      )
      expect(result.studio_name).toBe('Real Animation Inc')
    })

    it('returns null when no studio is flagged isAnimationStudio', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')
      const result = normaliseAnilistAnime(
        makeAnime({
          studios: {
            nodes: [
              { id: 100, name: 'Producer Co', isAnimationStudio: false },
            ],
          },
        }),
      )
      expect(result.studio_name).toBeNull()
    })

    it('returns null when studios block is missing', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')
      const result = normaliseAnilistAnime(
        makeAnime({ studios: undefined }),
      )
      expect(result.studio_name).toBeNull()
    })
  })

  describe('cover image fallback chain', () => {
    it('prefers extraLarge over large over medium', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')
      const onlyMedium = normaliseAnilistAnime(
        makeAnime({
          coverImage: {
            extraLarge: null,
            large: null,
            medium: 'https://cdn.example/medium.jpg',
            color: null,
          },
        }),
      )
      expect(onlyMedium.poster_path).toBe('https://cdn.example/medium.jpg')

      const onlyLarge = normaliseAnilistAnime(
        makeAnime({
          coverImage: {
            extraLarge: null,
            large: 'https://cdn.example/large.jpg',
            medium: 'https://cdn.example/medium.jpg',
            color: null,
          },
        }),
      )
      expect(onlyLarge.poster_path).toBe('https://cdn.example/large.jpg')
    })

    it('returns null when coverImage missing entirely', async () => {
      const { normaliseAnilistAnime } = await import('@/lib/normalise/anime')
      const result = normaliseAnilistAnime(
        makeAnime({ coverImage: undefined }),
      )
      expect(result.poster_path).toBeNull()
    })
  })
})
