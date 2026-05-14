import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { MediaType, WatchStatus } from '@prisma/client'

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

const dbMock = vi.hoisted(() => ({
  userEntry: { findMany: vi.fn() },
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

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'))
}

const fixtureEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 'entry-1',
  media_item_id: 'media-1',
  status: WatchStatus.WATCHING,
  user_rating: null,
  progress: 0,
  notes: null,
  started_at: null,
  completed_at: null,
  created_at: new Date('2026-05-10T12:00:00Z'),
  updated_at: new Date('2026-05-12T12:00:00Z'),
  media_item: {
    id: 'media-1',
    type: MediaType.MOVIE,
    title: 'Fight Club',
    original_title: null,
    release_date: new Date('1999-10-15T00:00:00Z'),
    end_date: null,
    poster_path: '/poster.jpg',
    backdrop_path: null,
    overview: null,
    genres: [],
    rating: null,
    popularity: null,
    status: null,
    tmdb_id: 550,
    anilist_id: null,
    igdb_id: null,
    steam_id: null,
    parent_id: null,
    franchise_id: null,
    created_at: new Date('2026-05-10T12:00:00Z'),
    updated_at: new Date('2026-05-12T12:00:00Z'),
  },
  ...overrides,
})

describe('GET /api/library', () => {
  it('returns 400 on invalid status value', async () => {
    const { GET } = await import('@/app/api/library/route')
    const res = await GET(makeRequest('/api/library?status=NONSENSE'))
    expect(res.status).toBe(400)
    expect(dbMock.userEntry.findMany).not.toHaveBeenCalled()
  })

  it('returns 400 on negative limit', async () => {
    const { GET } = await import('@/app/api/library/route')
    const res = await GET(makeRequest('/api/library?limit=-5'))
    expect(res.status).toBe(400)
  })

  it('caps limit at 100 (rejects beyond)', async () => {
    const { GET } = await import('@/app/api/library/route')
    const res = await GET(makeRequest('/api/library?limit=200'))
    expect(res.status).toBe(400)
  })

  it('returns empty items array when no entries match', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/library/route')
    const res = await GET(makeRequest('/api/library?status=WATCHING'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.items).toEqual([])
  })

  it('applies status filter to the Prisma query when status param is set', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/library/route')
    await GET(makeRequest('/api/library?status=WATCHING&limit=5'))
    expect(dbMock.userEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: WatchStatus.WATCHING },
        orderBy: { updated_at: 'desc' },
        take: 5,
      }),
    )
  })

  it('omits the where clause when status is not set', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/library/route')
    await GET(makeRequest('/api/library?limit=20'))
    expect(dbMock.userEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: undefined,
        take: 20,
      }),
    )
  })

  it('respects order=created_at_desc', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/library/route')
    await GET(makeRequest('/api/library?order=created_at_desc'))
    expect(dbMock.userEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { created_at: 'desc' },
      }),
    )
  })

  it('defaults order to updated_at_desc and limit to 20', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/library/route')
    await GET(makeRequest('/api/library'))
    expect(dbMock.userEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { updated_at: 'desc' },
        take: 20,
      }),
    )
  })

  it('serializes a movie WATCHING entry with progressLabel + sourceLabel', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([fixtureEntry({ progress: 0 })])
    const { GET } = await import('@/app/api/library/route')
    const res = await GET(makeRequest('/api/library?status=WATCHING'))
    const body = await res.json()
    expect(body.items).toHaveLength(1)
    const item = body.items[0]
    expect(item.id).toBe('entry-1')
    expect(item.mediaItemId).toBe('media-1')
    expect(item.mediaType).toBe('MOVIE')
    expect(item.title).toBe('Fight Club')
    expect(item.posterPath).toBe('/poster.jpg')
    expect(item.year).toBe(1999)
    expect(item.sourceLabel).toBe('From TMDB')
    expect(item.progressLabel).toBe('WATCHING')
    expect(item.progressPct).toBe(0)
  })

  it('formats progressLabel as "X% WATCHED" for movies with mid progress', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([fixtureEntry({ progress: 42 })])
    const { GET } = await import('@/app/api/library/route')
    const res = await GET(makeRequest('/api/library?status=WATCHING'))
    const body = await res.json()
    expect(body.items[0].progressLabel).toBe('42% WATCHED')
    expect(body.items[0].progressPct).toBe(42)
  })

  it('applies release_date gte + lte filter when released_within_days is set', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([])
    const before = Date.now()
    const { GET } = await import('@/app/api/library/route')
    await GET(makeRequest('/api/library?released_within_days=30&limit=20'))
    const after = Date.now()
    const call = dbMock.userEntry.findMany.mock.calls[0][0]
    const filter = call.where.media_item.release_date
    expect(filter.gte).toBeInstanceOf(Date)
    expect(filter.lte).toBeInstanceOf(Date)

    const floor: Date = filter.gte
    const expectedFloor = before - 30 * 24 * 60 * 60 * 1000
    const expectedFloorMax = after - 30 * 24 * 60 * 60 * 1000
    expect(floor.getTime()).toBeGreaterThanOrEqual(expectedFloor)
    expect(floor.getTime()).toBeLessThanOrEqual(expectedFloorMax)

    // Upper bound clamps future-dated releases out of the "Recently Released"
    // band; the lte must land between `before` and `after`.
    const ceiling: Date = filter.lte
    expect(ceiling.getTime()).toBeGreaterThanOrEqual(before)
    expect(ceiling.getTime()).toBeLessThanOrEqual(after)
  })

  it('forces order release_date_desc when released_within_days is set, regardless of order param', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([])
    const { GET } = await import('@/app/api/library/route')
    await GET(makeRequest('/api/library?released_within_days=30&order=created_at_desc'))
    expect(dbMock.userEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { media_item: { release_date: 'desc' } },
      }),
    )
  })

  it('rejects released_within_days beyond 3650 (10 years)', async () => {
    const { GET } = await import('@/app/api/library/route')
    const res = await GET(makeRequest('/api/library?released_within_days=4000'))
    expect(res.status).toBe(400)
  })

  it('rejects negative released_within_days', async () => {
    const { GET } = await import('@/app/api/library/route')
    const res = await GET(makeRequest('/api/library?released_within_days=-10'))
    expect(res.status).toBe(400)
  })

  it('flattens 1970 sentinel release_date to year=null + releaseDate=null', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([
      fixtureEntry({
        media_item: {
          ...fixtureEntry().media_item,
          release_date: new Date('1970-01-01T00:00:00Z'),
        },
      }),
    ])
    const { GET } = await import('@/app/api/library/route')
    const res = await GET(makeRequest('/api/library'))
    const body = await res.json()
    expect(body.items[0].year).toBeNull()
    expect(body.items[0].releaseDate).toBeNull()
  })
})
