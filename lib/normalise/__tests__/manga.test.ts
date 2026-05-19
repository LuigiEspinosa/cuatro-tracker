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

function makeManga(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 30002,
    idMal: 2,
    type: 'MANGA',
    format: 'MANGA',
    status: 'RELEASING',
    title: {
      romaji: 'Berserk',
      english: 'Berserk',
      native: 'ベルセルク',
      userPreferred: 'Berserk',
    },
    description: 'His name is Guts...',
    startDate: { year: 1989, month: 8, day: 25 },
    endDate: { year: null, month: null, day: null },
    season: null,
    seasonYear: null,
    episodes: null,
    chapters: 374,
    volumes: 41,
    duration: null,
    genres: ['Action', 'Adventure', 'Drama', 'Fantasy', 'Horror'],
    averageScore: 94,
    popularity: 500000,
    coverImage: {
      extraLarge:
        'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx30002-x.jpg',
      large:
        'https://s4.anilist.co/file/anilistcdn/media/manga/cover/medium/bx30002-x.jpg',
      medium: null,
      color: '#c43d3d',
    },
    bannerImage: null,
    staff: {
      edges: [
        {
          role: 'Story & Art',
          node: {
            id: 100029,
            name: { full: 'Kentarou Miura', native: '三浦 建太郎' },
          },
        },
        {
          role: 'Assistant',
          node: { id: 100030, name: { full: 'Studio Gaga', native: null } },
        },
      ],
    },
    source: null,
    isAdult: false,
    ...overrides,
  }
}

describe('lib/normalise/manga', () => {
  describe('happy path', () => {
    it('maps every documented field correctly', async () => {
      const { normaliseAnilistManga } = await import('@/lib/normalise/manga')

      const result = normaliseAnilistManga(makeManga())

      expect(result).toMatchObject({
        type: MediaType.MANGA,
        title: 'Berserk',
        original_title: 'ベルセルク',
        overview: 'His name is Guts...',
        poster_path:
          'https://s4.anilist.co/file/anilistcdn/media/manga/cover/large/bx30002-x.jpg',
        backdrop_path: null,
        rating: 94,
        popularity: 500000,
        genres: ['Action', 'Adventure', 'Drama', 'Fantasy', 'Horror'],
        status: 'RELEASING',
        chapter_count: 374,
        volume_count: 41,
        format: 'MANGA',
        author_name: 'Kentarou Miura',
        anilist_id: 30002,
      })
      expect(result.release_date).toBeInstanceOf(Date)
      expect((result.release_date as Date).getFullYear()).toBe(1989)
    })
  })

  describe('author selection', () => {
    it('picks "Story & Art" before plain "Story"', async () => {
      const { normaliseAnilistManga } = await import('@/lib/normalise/manga')
      const result = normaliseAnilistManga(
        makeManga({
          staff: {
            edges: [
              {
                role: 'Story',
                node: { id: 1, name: { full: 'Plain Story Person' } },
              },
              {
                role: 'Story & Art',
                node: { id: 2, name: { full: 'The Real Author' } },
              },
            ],
          },
        }),
      )
      expect(result.author_name).toBe('The Real Author')
    })

    it('falls back to plain "Story" when no "Story & Art" edge', async () => {
      const { normaliseAnilistManga } = await import('@/lib/normalise/manga')
      const result = normaliseAnilistManga(
        makeManga({
          staff: {
            edges: [
              {
                role: 'Story',
                node: { id: 1, name: { full: 'Tsugumi Ohba' } },
              },
              {
                role: 'Art',
                node: { id: 2, name: { full: 'Takeshi Obata' } },
              },
            ],
          },
        }),
      )
      expect(result.author_name).toBe('Tsugumi Ohba')
    })

    it('returns null when staff has no Story or Story & Art edge', async () => {
      const { normaliseAnilistManga } = await import('@/lib/normalise/manga')
      const result = normaliseAnilistManga(
        makeManga({
          staff: {
            edges: [
              {
                role: 'Translator',
                node: { id: 1, name: { full: 'Some Translator' } },
              },
            ],
          },
        }),
      )
      expect(result.author_name).toBeNull()
    })

    it('returns null when staff block missing', async () => {
      const { normaliseAnilistManga } = await import('@/lib/normalise/manga')
      const result = normaliseAnilistManga(
        makeManga({ staff: undefined }),
      )
      expect(result.author_name).toBeNull()
    })

    it('returns null when staff has no edges', async () => {
      const { normaliseAnilistManga } = await import('@/lib/normalise/manga')
      const result = normaliseAnilistManga(
        makeManga({ staff: { edges: [] } }),
      )
      expect(result.author_name).toBeNull()
    })
  })

  describe('title fallback chain', () => {
    it('falls back to native when romaji + english + userPreferred all null', async () => {
      const { normaliseAnilistManga } = await import('@/lib/normalise/manga')
      const result = normaliseAnilistManga(
        makeManga({
          title: {
            romaji: null,
            english: null,
            native: 'ベルセルク',
            userPreferred: null,
          },
        }),
      )
      expect(result.title).toBe('ベルセルク')
    })
  })

  describe('partial-date handling (NFR13 + NFR14)', () => {
    it('builds Jan 1 from year-only startDate', async () => {
      const { normaliseAnilistManga } = await import('@/lib/normalise/manga')
      const result = normaliseAnilistManga(
        makeManga({ startDate: { year: 2020, month: null, day: null } }),
      )
      const date = result.release_date as Date
      expect(date.getFullYear()).toBe(2020)
      expect(date.getMonth()).toBe(0)
      expect(date.getDate()).toBe(1)
      expect(Number.isNaN(date.getTime())).toBe(false)
    })

    it('falls through to 1970 sentinel when year is null', async () => {
      const { normaliseAnilistManga } = await import('@/lib/normalise/manga')
      const result = normaliseAnilistManga(
        makeManga({ startDate: { year: null, month: null, day: null } }),
      )
      const date = result.release_date as Date
      expect(date.toISOString()).toBe('1970-01-01T00:00:00.000Z')
    })

    it('keeps NFR13 invariant for every fixture variant', async () => {
      const { normaliseAnilistManga } = await import('@/lib/normalise/manga')
      const variants = [
        makeManga(),
        makeManga({ startDate: { year: 2020, month: null, day: null } }),
        makeManga({ startDate: { year: null, month: null, day: null } }),
        makeManga({ endDate: undefined }),
      ]
      for (const variant of variants) {
        const result = normaliseAnilistManga(variant)
        expect(result.release_date).toBeInstanceOf(Date)
        expect(
          Number.isNaN((result.release_date as Date).getTime()),
        ).toBe(false)
      }
    })
  })

  describe('ongoing-manga end_date handling', () => {
    it('end_date is null when AniList reports endDate.year as null (manga still releasing)', async () => {
      const { normaliseAnilistManga } = await import('@/lib/normalise/manga')
      const result = normaliseAnilistManga(makeManga())
      expect(result.end_date).toBeNull()
    })
  })
})
