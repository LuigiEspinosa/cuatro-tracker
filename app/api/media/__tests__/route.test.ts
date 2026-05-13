import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { MediaType, Prisma, WatchStatus } from '@prisma/client'

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
  getMovie: vi.fn(),
}))

vi.mock('@/lib/api/tmdb', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/tmdb')>('@/lib/api/tmdb')
  return {
    ...actual,
    getMovie: tmdbMock.getMovie,
  }
})

const dbMock = vi.hoisted(() => ({
  mediaItem: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  userEntry: {
    create: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({ db: dbMock }))

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

const validTmdbMovie = {
  id: 550,
  title: 'Fight Club',
  original_title: 'Fight Club',
  overview: 'A ticking-time-bomb insomniac...',
  release_date: '1999-10-15',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  vote_average: 8.4,
  popularity: 64.2,
  genres: [{ id: 18, name: 'Drama' }],
  status: 'Released',
}

function postRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/media'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function newMediaItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cm_test_1',
    type: MediaType.MOVIE,
    title: 'Fight Club',
    original_title: 'Fight Club',
    release_date: new Date('1999-10-15T00:00:00Z'),
    end_date: null,
    poster_path: '/poster.jpg',
    backdrop_path: '/backdrop.jpg',
    overview: 'A ticking-time-bomb insomniac...',
    genres: ['Drama'],
    rating: 8.4,
    popularity: 64.2,
    status: null,
    tmdb_id: 550,
    anilist_id: null,
    igdb_id: null,
    steam_id: null,
    parent_id: null,
    franchise_id: null,
    created_at: new Date('2026-05-13T00:00:00Z'),
    updated_at: new Date('2026-05-13T00:00:00Z'),
    user_entry: null,
    ...overrides,
  }
}

function newUserEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cm_ue_1',
    media_item_id: 'cm_test_1',
    status: WatchStatus.PLAN_TO_WATCH,
    user_rating: null,
    progress: 0,
    notes: null,
    started_at: null,
    completed_at: null,
    created_at: new Date('2026-05-13T00:00:00Z'),
    updated_at: new Date('2026-05-13T00:00:00Z'),
    ...overrides,
  }
}

describe('POST /api/media', () => {
  describe('body validation', () => {
    it('returns 400 invalid_json when body is not parseable', async () => {
      const { POST } = await import('@/app/api/media/route')

      const req = new NextRequest(new URL('http://localhost/api/media'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('invalid_body')
      expect(body.reason).toBe('invalid_json')
    })

    it('returns 400 when source is missing', async () => {
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({ sourceId: 550, type: MediaType.MOVIE }),
      )

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('invalid_body')
      expect(body.issues).toBeDefined()
    })

    it('returns 400 when sourceId is negative', async () => {
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({ source: 'tmdb', sourceId: -1, type: MediaType.MOVIE }),
      )

      expect(res.status).toBe(400)
    })

    it('coerces string sourceId to number', async () => {
      tmdbMock.getMovie.mockResolvedValue(validTmdbMovie)
      dbMock.mediaItem.findUnique.mockResolvedValue(null)
      dbMock.mediaItem.findMany.mockResolvedValue([])
      dbMock.mediaItem.create.mockResolvedValue(
        newMediaItem({ user_entry: newUserEntry() }),
      )
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({ source: 'tmdb', sourceId: '550', type: MediaType.MOVIE }),
      )

      expect(res.status).toBe(201)
      expect(tmdbMock.getMovie).toHaveBeenCalledWith(550)
    })
  })

  describe('dispatcher routing', () => {
    it('returns 501 for unwired source (anilist)', async () => {
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({
          source: 'anilist',
          sourceId: 1234,
          type: MediaType.ANIME,
        }),
      )

      expect(res.status).toBe(501)
      const body = await res.json()
      expect(body.error).toBe('unsupported_source_type')
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'media.unsupported_source_type',
          source: 'anilist',
        }),
        expect.any(String),
      )
    })

    it('returns 501 for unwired type (tmdb + TV_SHOW)', async () => {
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({
          source: 'tmdb',
          sourceId: 1399,
          type: MediaType.TV_SHOW,
        }),
      )

      expect(res.status).toBe(501)
    })
  })

  describe('happy path (create new MediaItem + UserEntry)', () => {
    it('returns 201 with MediaItem + UserEntry when source ID is new', async () => {
      tmdbMock.getMovie.mockResolvedValue(validTmdbMovie)
      dbMock.mediaItem.findUnique.mockResolvedValue(null)
      dbMock.mediaItem.findMany.mockResolvedValue([])
      dbMock.mediaItem.create.mockResolvedValue(
        newMediaItem({ user_entry: newUserEntry() }),
      )
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({ source: 'tmdb', sourceId: 550, type: MediaType.MOVIE }),
      )

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.mediaItem.tmdb_id).toBe(550)
      expect(body.mediaItem.user_entry.status).toBe(WatchStatus.PLAN_TO_WATCH)
      expect(body.mediaItem.user_entry.progress).toBe(0)
      expect(body.merged).toBe(false)
    })

    it('sets Cache-Control: no-store on success', async () => {
      tmdbMock.getMovie.mockResolvedValue(validTmdbMovie)
      dbMock.mediaItem.findUnique.mockResolvedValue(null)
      dbMock.mediaItem.findMany.mockResolvedValue([])
      dbMock.mediaItem.create.mockResolvedValue(
        newMediaItem({ user_entry: newUserEntry() }),
      )
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({ source: 'tmdb', sourceId: 550, type: MediaType.MOVIE }),
      )

      expect(res.headers.get('Cache-Control')).toBe('no-store')
    })

    it('passes the nested user_entry create to db.mediaItem.create', async () => {
      tmdbMock.getMovie.mockResolvedValue(validTmdbMovie)
      dbMock.mediaItem.findUnique.mockResolvedValue(null)
      dbMock.mediaItem.findMany.mockResolvedValue([])
      dbMock.mediaItem.create.mockResolvedValue(
        newMediaItem({ user_entry: newUserEntry() }),
      )
      const { POST } = await import('@/app/api/media/route')

      await POST(
        postRequest({ source: 'tmdb', sourceId: 550, type: MediaType.MOVIE }),
      )

      const callArg = dbMock.mediaItem.create.mock.calls[0][0]
      expect(callArg.data.user_entry).toEqual({
        create: { status: WatchStatus.PLAN_TO_WATCH, progress: 0 },
      })
      expect(callArg.include).toEqual({ user_entry: true })
    })
  })

  describe('idempotent (MediaItem already exists)', () => {
    it('returns 200 with existing MediaItem + UserEntry when both exist', async () => {
      const existing = newMediaItem({ user_entry: newUserEntry() })
      dbMock.mediaItem.findUnique.mockResolvedValue(existing)
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({ source: 'tmdb', sourceId: 550, type: MediaType.MOVIE }),
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.mediaItem.id).toBe('cm_test_1')
      expect(body.merged).toBe(false)
      expect(dbMock.mediaItem.create).not.toHaveBeenCalled()
      expect(dbMock.userEntry.create).not.toHaveBeenCalled()
      expect(tmdbMock.getMovie).not.toHaveBeenCalled()
    })

    it('returns 201 when MediaItem exists but UserEntry does not (creates UserEntry only)', async () => {
      const existing = newMediaItem({ user_entry: null })
      dbMock.mediaItem.findUnique.mockResolvedValue(existing)
      dbMock.userEntry.create.mockResolvedValue(newUserEntry())
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({ source: 'tmdb', sourceId: 550, type: MediaType.MOVIE }),
      )

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.merged).toBe(false)
      expect(dbMock.userEntry.create).toHaveBeenCalledWith({
        data: {
          media_item_id: 'cm_test_1',
          status: WatchStatus.PLAN_TO_WATCH,
          progress: 0,
        },
      })
    })
  })

  describe('cross-source merge (AC-4)', () => {
    it('patches new source ID onto existing row with matching title + year, returns merged: true', async () => {
      tmdbMock.getMovie.mockResolvedValue(validTmdbMovie)
      // No existing by tmdb_id
      dbMock.mediaItem.findUnique.mockResolvedValue(null)
      // But a cross-source match (anilist row with same title+year, tmdb_id null)
      const anilistRow = newMediaItem({
        id: 'cm_anilist_1',
        tmdb_id: null,
        anilist_id: 1234,
        user_entry: newUserEntry({ media_item_id: 'cm_anilist_1' }),
      })
      dbMock.mediaItem.findMany.mockResolvedValue([anilistRow])
      dbMock.mediaItem.update.mockResolvedValue({
        ...anilistRow,
        tmdb_id: 550,
      })
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({ source: 'tmdb', sourceId: 550, type: MediaType.MOVIE }),
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.merged).toBe(true)
      expect(body.mediaItem.tmdb_id).toBe(550)
      expect(body.mediaItem.anilist_id).toBe(1234)
      expect(dbMock.mediaItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cm_anilist_1' },
          data: { tmdb_id: 550 },
        }),
      )
    })

    it('does NOT cross-merge when title normalises differently (year matches but title does not)', async () => {
      tmdbMock.getMovie.mockResolvedValue(validTmdbMovie)
      dbMock.mediaItem.findUnique.mockResolvedValue(null)
      dbMock.mediaItem.findMany.mockResolvedValue([
        newMediaItem({
          id: 'cm_other',
          title: 'The Matrix',
          tmdb_id: null,
        }),
      ])
      dbMock.mediaItem.create.mockResolvedValue(
        newMediaItem({ user_entry: newUserEntry() }),
      )
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({ source: 'tmdb', sourceId: 550, type: MediaType.MOVIE }),
      )

      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.merged).toBe(false)
      expect(dbMock.mediaItem.update).not.toHaveBeenCalled()
      expect(dbMock.mediaItem.create).toHaveBeenCalled()
    })
  })

  describe('error paths', () => {
    it('returns 502 when the adapter throws TmdbApiError', async () => {
      const { TmdbApiError } = await import('@/lib/api/tmdb')
      tmdbMock.getMovie.mockRejectedValue(
        new TmdbApiError('TMDB HTTP 500: /movie/550', {
          endpoint: '/movie/550',
          httpStatus: 500,
        }),
      )
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({ source: 'tmdb', sourceId: 550, type: MediaType.MOVIE }),
      )

      expect(res.status).toBe(502)
      const body = await res.json()
      expect(body.error).toBe('upstream_failed')
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'media.upstream_failed',
          source: 'tmdb',
          sourceId: 550,
        }),
        expect.any(String),
      )
    })

    it('returns 422 when the normaliser throws ZodError (upstream payload shape drift)', async () => {
      tmdbMock.getMovie.mockResolvedValue({ ...validTmdbMovie, title: 1234 })
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({ source: 'tmdb', sourceId: 550, type: MediaType.MOVIE }),
      )

      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error).toBe('normalise_failed')
      expect(body.issues).toBeDefined()
    })

    it('returns 400 on Prisma constraint violation (P2002 race lost → idempotent retry)', async () => {
      tmdbMock.getMovie.mockResolvedValue(validTmdbMovie)
      dbMock.mediaItem.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(newMediaItem({ user_entry: newUserEntry() }))
      dbMock.mediaItem.findMany.mockResolvedValue([])
      dbMock.mediaItem.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`tmdb_id`)',
          { code: 'P2002', clientVersion: '6.0.0' },
        ),
      )
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({ source: 'tmdb', sourceId: 550, type: MediaType.MOVIE }),
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.merged).toBe(false)
    })

    it('returns 400 on Prisma constraint violation (P2004 CHECK failure)', async () => {
      tmdbMock.getMovie.mockResolvedValue(validTmdbMovie)
      dbMock.mediaItem.findUnique.mockResolvedValue(null)
      dbMock.mediaItem.findMany.mockResolvedValue([])
      dbMock.mediaItem.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'CHECK constraint failed: progress >= 0',
          { code: 'P2004', clientVersion: '6.0.0' },
        ),
      )
      const { POST } = await import('@/app/api/media/route')

      const res = await POST(
        postRequest({ source: 'tmdb', sourceId: 550, type: MediaType.MOVIE }),
      )

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toBe('constraint_violation')
      expect(body.code).toBe('P2004')
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'media.constraint_violation',
          code: 'P2004',
        }),
        expect.any(String),
      )
    })
  })
})
