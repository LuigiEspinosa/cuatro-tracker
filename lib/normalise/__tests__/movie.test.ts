import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ZodError } from 'zod'
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

const validMovie = {
  id: 550,
  title: 'Fight Club',
  original_title: 'Fight Club',
  overview: 'A ticking-time-bomb insomniac...',
  release_date: '1999-10-15',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  vote_average: 8.4,
  popularity: 64.2,
  genres: [
    { id: 18, name: 'Drama' },
    { id: 53, name: 'Thriller' },
  ],
  status: 'Released',
}

describe('lib/normalise/movie', () => {
  describe('happy path', () => {
    it('maps every documented field correctly', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbMovie(validMovie)

      expect(result).toMatchObject({
        type: MediaType.MOVIE,
        title: 'Fight Club',
        original_title: 'Fight Club',
        overview: 'A ticking-time-bomb insomniac...',
        poster_path: '/poster.jpg',
        backdrop_path: '/backdrop.jpg',
        rating: 8.4,
        popularity: 64.2,
        tmdb_id: 550,
      })
      expect(result.genres).toEqual(['Drama', 'Thriller'])
      expect(result.release_date).toBeInstanceOf(Date)
      expect((result.release_date as Date).toISOString()).toBe(
        '1999-10-15T00:00:00.000Z',
      )
    })

    it('does NOT include status (out of AC-1 scope)', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbMovie(validMovie)

      expect(result).not.toHaveProperty('status')
    })

    it('preserves path-only poster + backdrop (no domain prefix)', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbMovie(validMovie)

      expect(result.poster_path).toBe('/poster.jpg')
      expect(result.backdrop_path).toBe('/backdrop.jpg')
      expect(result.poster_path).not.toContain('http')
      expect(result.backdrop_path).not.toContain('http')
    })
  })

  describe('release_date fallback chain', () => {
    it('falls back to 1970-01-01 sentinel when release_date is null', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbMovie({ ...validMovie, release_date: null })

      expect((result.release_date as Date).toISOString()).toBe(
        '1970-01-01T00:00:00.000Z',
      )
    })

    it('falls back to 1970-01-01 sentinel when release_date is an empty string', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbMovie({ ...validMovie, release_date: '' })

      expect((result.release_date as Date).toISOString()).toBe(
        '1970-01-01T00:00:00.000Z',
      )
    })

    it('constructs Jan 1 of year (UTC) when release_date is year-only "2024"', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbMovie({
        ...validMovie,
        release_date: '2024',
      })

      expect((result.release_date as Date).toISOString()).toBe(
        '2024-01-01T00:00:00.000Z',
      )
    })

    it('falls back to sentinel when release_date is a malformed string (not yyyy-mm-dd, not yyyy)', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbMovie({
        ...validMovie,
        release_date: 'not-a-date',
      })

      expect((result.release_date as Date).toISOString()).toBe(
        '1970-01-01T00:00:00.000Z',
      )
    })

    it('falls back to sentinel when release_date is structurally yyyy-mm-dd but invalid (e.g. 2024-13-45)', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbMovie({
        ...validMovie,
        release_date: '2024-13-45',
      })

      expect((result.release_date as Date).toISOString()).toBe(
        '1970-01-01T00:00:00.000Z',
      )
    })
  })

  describe('malformed input', () => {
    it('throws ZodError with .issues path referencing release_date when release_date is a number', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const broken = { ...validMovie, release_date: 1234 }

      expect(() => normaliseTmdbMovie(broken)).toThrow(ZodError)
      try {
        normaliseTmdbMovie(broken)
      } catch (err) {
        expect(err).toBeInstanceOf(ZodError)
        if (err instanceof ZodError) {
          const releaseDateIssue = err.issues.find(
            (i) => i.path[0] === 'release_date',
          )
          expect(releaseDateIssue).toBeDefined()
        }
      }
    })

    it('throws ZodError when a required field is missing entirely', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const { title: _title, ...broken } = validMovie

      expect(() => normaliseTmdbMovie(broken)).toThrow(ZodError)
    })

    it('throws ZodError when genres is not an array', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const broken = { ...validMovie, genres: 'Drama' }

      expect(() => normaliseTmdbMovie(broken)).toThrow(ZodError)
    })

    it('throws ZodError when input is null or undefined', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      expect(() => normaliseTmdbMovie(null)).toThrow(ZodError)
      expect(() => normaliseTmdbMovie(undefined)).toThrow(ZodError)
    })
  })

  describe('nullable / empty source-field handling', () => {
    it('maps an empty genres array through unchanged', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbMovie({ ...validMovie, genres: [] })

      expect(result.genres).toEqual([])
    })

    it('preserves null poster_path (TMDB returns null for movies without art)', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbMovie({ ...validMovie, poster_path: null })

      expect(result.poster_path).toBeNull()
    })

    it('preserves null backdrop_path', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbMovie({
        ...validMovie,
        backdrop_path: null,
      })

      expect(result.backdrop_path).toBeNull()
    })


    it('writes null when original_title is absent from the source', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const { original_title: _ot, ...source } = validMovie

      const result = normaliseTmdbMovie(source)

      expect(result.original_title).toBeNull()
    })

    it('writes null when overview is null in the source', async () => {
      const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbMovie({ ...validMovie, overview: null })

      expect(result.overview).toBeNull()
    })
  })

  describe('NFR13 invariant: release_date is always a valid Date', () => {
    const variants: Array<{ name: string; release_date: unknown }> = [
      { name: 'happy yyyy-mm-dd', release_date: '1999-10-15' },
      { name: 'null', release_date: null },
      { name: 'empty string', release_date: '' },
      { name: 'year-only', release_date: '2024' },
      { name: 'malformed string', release_date: 'foo' },
      { name: 'invalid yyyy-mm-dd', release_date: '2024-13-45' },
    ]

    it.each(variants)(
      'produces a valid Date for variant "$name"',
      async ({ release_date }) => {
        const { normaliseTmdbMovie } = await import('@/lib/normalise/movie')

        const result = normaliseTmdbMovie({ ...validMovie, release_date })

        expect(result.release_date).toBeInstanceOf(Date)
        expect(Number.isNaN((result.release_date as Date).getTime())).toBe(
          false,
        )
      },
    )
  })

  describe('normaliseTmdbCredits', () => {
    const validCredits = {
      cast: [
        {
          id: 287,
          name: 'Brad Pitt',
          character: 'Tyler Durden',
          order: 0,
          profile_path: '/bp.jpg',
        },
        {
          id: 819,
          name: 'Edward Norton',
          character: 'The Narrator',
          order: 1,
          profile_path: '/en.jpg',
        },
      ],
      crew: [
        {
          id: 7467,
          name: 'David Fincher',
          job: 'Director',
          department: 'Directing',
          profile_path: '/df.jpg',
        },
        {
          id: 7468,
          name: 'Jim Uhls',
          job: 'Screenplay',
          department: 'Writing',
          profile_path: null,
        },
      ],
    }

    it('maps cast members to the normalised domain shape with character → role', async () => {
      const { normaliseTmdbCredits } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbCredits(validCredits)

      expect(result.cast).toEqual([
        {
          id: 287,
          name: 'Brad Pitt',
          role: 'Tyler Durden',
          order: 0,
          profile_path: '/bp.jpg',
        },
        {
          id: 819,
          name: 'Edward Norton',
          role: 'The Narrator',
          order: 1,
          profile_path: '/en.jpg',
        },
      ])
    })

    it('maps crew members to the normalised domain shape with job → role and array-index order', async () => {
      const { normaliseTmdbCredits } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbCredits(validCredits)

      expect(result.crew).toEqual([
        {
          id: 7467,
          name: 'David Fincher',
          role: 'Director',
          order: 0,
          profile_path: '/df.jpg',
        },
        {
          id: 7468,
          name: 'Jim Uhls',
          role: 'Screenplay',
          order: 1,
          profile_path: null,
        },
      ])
    })

    it('falls back to empty string when a cast member has null character (uncredited)', async () => {
      const { normaliseTmdbCredits } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbCredits({
        cast: [
          {
            id: 1,
            name: 'Archival Footage',
            character: null,
            order: 0,
            profile_path: null,
          },
        ],
        crew: [],
      })

      expect(result.cast[0].role).toBe('')
    })

    it('returns empty arrays when input has empty cast and crew', async () => {
      const { normaliseTmdbCredits } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbCredits({ cast: [], crew: [] })

      expect(result).toEqual({ cast: [], crew: [] })
    })

    it('preserves input order (no implicit sort by order field)', async () => {
      const { normaliseTmdbCredits } = await import('@/lib/normalise/movie')

      const result = normaliseTmdbCredits({
        cast: [
          {
            id: 1,
            name: 'A',
            character: 'X',
            order: 5,
            profile_path: null,
          },
          {
            id: 2,
            name: 'B',
            character: 'Y',
            order: 1,
            profile_path: null,
          },
          {
            id: 3,
            name: 'C',
            character: 'Z',
            order: 3,
            profile_path: null,
          },
        ],
        crew: [],
      })

      expect(result.cast.map((c) => c.id)).toEqual([1, 2, 3])
      expect(result.cast.map((c) => c.order)).toEqual([5, 1, 3])
    })

    it('throws ZodError when a cast id is the wrong type', async () => {
      const { normaliseTmdbCredits } = await import('@/lib/normalise/movie')

      expect(() =>
        normaliseTmdbCredits({
          cast: [
            {
              id: 'not-a-number',
              name: 'X',
              character: 'Y',
              order: 0,
              profile_path: null,
            },
          ],
          crew: [],
        }),
      ).toThrow(ZodError)
    })

    it('throws ZodError when input is null or undefined', async () => {
      const { normaliseTmdbCredits } = await import('@/lib/normalise/movie')

      expect(() => normaliseTmdbCredits(null)).toThrow(ZodError)
      expect(() => normaliseTmdbCredits(undefined)).toThrow(ZodError)
    })
  })
})
