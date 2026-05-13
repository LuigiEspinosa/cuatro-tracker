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

  describe('original_title and overview nullable handling', () => {
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
})
