import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

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

const tmdbMock = vi.hoisted(() => ({
  searchMulti: vi.fn(),
}))

vi.mock('@/lib/api/tmdb', () => ({
  searchMulti: tmdbMock.searchMulti,
}))

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
  vi.resetAllMocks()
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'))
}

const movieResult = {
  media_type: 'movie',
  id: 550,
  title: 'Fight Club',
  release_date: '1999-10-15',
  poster_path: '/poster.jpg',
  vote_average: 8.4,
  popularity: 64.2,
} as const

const tvResult = {
  media_type: 'tv',
  id: 1399,
  name: 'Game of Thrones',
  first_air_date: '2011-04-17',
  vote_average: 8.4,
} as const

const personResult = {
  media_type: 'person',
  id: 287,
  name: 'Brad Pitt',
  known_for_department: 'Acting',
} as const

describe('GET /api/search', () => {
  describe('query validation', () => {
    it('returns 400 when q is missing', async () => {
      const { GET } = await import('@/app/api/search/route')

      const res = await GET(makeRequest('/api/search'))

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('invalid_query')
      expect(body.issues[0].path).toEqual(['q'])
    })

    it('returns 400 when q is an empty string', async () => {
      const { GET } = await import('@/app/api/search/route')

      const res = await GET(makeRequest('/api/search?q='))

      expect(res.status).toBe(400)
    })

    it('returns 400 when q is whitespace-only (Zod .trim() then .min(1))', async () => {
      const { GET } = await import('@/app/api/search/route')

      const res = await GET(makeRequest('/api/search?q=%20%20%20'))

      expect(res.status).toBe(400)
    })

    it('returns 400 when q exceeds 200 characters', async () => {
      const { GET } = await import('@/app/api/search/route')

      const res = await GET(
        makeRequest(`/api/search?q=${'a'.repeat(201)}`),
      )

      expect(res.status).toBe(400)
    })

    it('returns 400 when type is not in the allowed enum', async () => {
      const { GET } = await import('@/app/api/search/route')

      const res = await GET(makeRequest('/api/search?q=foo&type=podcast'))

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.issues[0].path).toEqual(['type'])
    })

    it('logs validation failures at warn level', async () => {
      const { GET } = await import('@/app/api/search/route')

      await GET(makeRequest('/api/search'))

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'search.bad_request' }),
        expect.any(String),
      )
    })
  })

  describe('happy path', () => {
    it('returns adapted movie + tv results from TMDB; filters person', async () => {
      tmdbMock.searchMulti.mockResolvedValue({
        page: 1,
        results: [movieResult, tvResult, personResult],
        total_pages: 1,
        total_results: 3,
      })
      const { GET } = await import('@/app/api/search/route')

      const res = await GET(makeRequest('/api/search?q=foo'))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.results).toHaveLength(2)
      expect(body.partialFailure).toBe(false)
      expect(body.results[0]).toMatchObject({
        type: 'movie',
        title: 'Fight Club',
        tmdb_id: 550,
        primary_source: 'tmdb',
        release_year: 1999,
        confidence: 1.0,
      })
      expect(body.results[1]).toMatchObject({
        type: 'tv',
        title: 'Game of Thrones',
        tmdb_id: 1399,
      })
    })

    it('sets Cache-Control: no-store on success', async () => {
      tmdbMock.searchMulti.mockResolvedValue({
        page: 1,
        results: [],
        total_pages: 1,
        total_results: 0,
      })
      const { GET } = await import('@/app/api/search/route')

      const res = await GET(makeRequest('/api/search?q=foo'))

      expect(res.headers.get('Cache-Control')).toBe('no-store')
    })
  })

  describe('type filter', () => {
    it('type=movie excludes the tv result', async () => {
      tmdbMock.searchMulti.mockResolvedValue({
        page: 1,
        results: [movieResult, tvResult],
        total_pages: 1,
        total_results: 2,
      })
      const { GET } = await import('@/app/api/search/route')

      const res = await GET(makeRequest('/api/search?q=foo&type=movie'))

      const body = await res.json()
      expect(body.results).toHaveLength(1)
      expect(body.results[0].type).toBe('movie')
    })

    it('type=tv excludes the movie result', async () => {
      tmdbMock.searchMulti.mockResolvedValue({
        page: 1,
        results: [movieResult, tvResult],
        total_pages: 1,
        total_results: 2,
      })
      const { GET } = await import('@/app/api/search/route')

      const res = await GET(makeRequest('/api/search?q=foo&type=tv'))

      const body = await res.json()
      expect(body.results).toHaveLength(1)
      expect(body.results[0].type).toBe('tv')
    })

    it('type=anime returns empty + partialFailure:false (no adapters wired in E4)', async () => {
      const { GET } = await import('@/app/api/search/route')

      const res = await GET(makeRequest('/api/search?q=foo&type=anime'))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ results: [], partialFailure: false })
      expect(tmdbMock.searchMulti).not.toHaveBeenCalled()
    })

    it('type=game returns empty + partialFailure:false (no adapters wired in E4)', async () => {
      const { GET } = await import('@/app/api/search/route')

      const res = await GET(makeRequest('/api/search?q=foo&type=game'))

      const body = await res.json()
      expect(body).toEqual({ results: [], partialFailure: false })
      expect(tmdbMock.searchMulti).not.toHaveBeenCalled()
    })
  })

  describe('partial failure', () => {
    it('flags partialFailure: true when TMDB rejects, returns empty results', async () => {
      tmdbMock.searchMulti.mockRejectedValue(new Error('boom'))
      const { GET } = await import('@/app/api/search/route')

      const res = await GET(makeRequest('/api/search?q=foo'))

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.results).toEqual([])
      expect(body.partialFailure).toBe(true)
    })

    it('logs each adapter rejection at warn with { source, durationMs, err }', async () => {
      const failure = new Error('TMDB down')
      tmdbMock.searchMulti.mockRejectedValue(failure)
      const { GET } = await import('@/app/api/search/route')

      await GET(makeRequest('/api/search?q=foo'))

      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'search.adapter_failed',
          source: 'tmdb',
          err: failure,
        }),
        expect.any(String),
      )
    })
  })
})
