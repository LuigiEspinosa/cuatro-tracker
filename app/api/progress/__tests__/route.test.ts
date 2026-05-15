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
  userEntry: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
  },
  mediaItem: {
    findUnique: vi.fn(),
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
  TMDB_WATCH_PROVIDER_COUNTRY: 'CO',
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

function putRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/progress'), {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

const fixtureEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 'entry-1',
  media_item_id: 'media-1',
  status: WatchStatus.PLAN_TO_WATCH,
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
    tmdb_id: 550,
  },
  ...overrides,
})

describe('PUT /api/progress', () => {
  it('returns 400 on invalid JSON body', async () => {
    const { PUT } = await import('@/app/api/progress/route')
    const req = new NextRequest(new URL('http://localhost/api/progress'), {
      method: 'PUT',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when mediaItemId is missing', async () => {
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(putRequest({ status: WatchStatus.WATCHING }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('invalid_body')
  })

  it('returns 400 when status is not a valid WatchStatus', async () => {
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'media-1', status: 'INVALID' }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when progress is negative', async () => {
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'media-1', progress: -1 }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when no updatable fields are provided', async () => {
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(putRequest({ mediaItemId: 'media-1' }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('empty_update')
    expect(dbMock.userEntry.findUnique).not.toHaveBeenCalled()
  })

  it('returns 404 when UserEntry does not exist AND MediaItem is a MOVIE', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(null)
    dbMock.mediaItem.findUnique.mockResolvedValue({
      id: 'missing',
      type: MediaType.MOVIE,
    })
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'missing', status: WatchStatus.WATCHING }),
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('not_in_library')
    expect(dbMock.userEntry.update).not.toHaveBeenCalled()
    expect(dbMock.userEntry.upsert).not.toHaveBeenCalled()
  })

  it('returns 404 when UserEntry does not exist AND MediaItem is missing entirely', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(null)
    dbMock.mediaItem.findUnique.mockResolvedValue(null)
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'missing', status: WatchStatus.WATCHING }),
    )
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('not_in_library')
  })

  it('lazy-creates UserEntry via upsert when MediaItem is a TV_EPISODE (Story 7.5 AC-5)', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(null)
    dbMock.mediaItem.findUnique.mockResolvedValue({
      id: 'ep-1',
      type: MediaType.TV_EPISODE,
    })
    dbMock.userEntry.upsert.mockResolvedValue({
      id: 'new-entry-1',
      media_item_id: 'ep-1',
      status: WatchStatus.COMPLETED,
      user_rating: null,
      progress: 0,
      notes: null,
      started_at: null,
      completed_at: null,
      created_at: new Date('2026-05-15T12:00:00Z'),
      updated_at: new Date('2026-05-15T12:00:00Z'),
    })
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'ep-1', status: WatchStatus.COMPLETED }),
    )
    expect(res.status).toBe(201)
    expect(dbMock.userEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { media_item_id: 'ep-1' },
        create: expect.objectContaining({
          media_item_id: 'ep-1',
          status: WatchStatus.COMPLETED,
          progress: 0,
        }),
        update: expect.objectContaining({
          status: WatchStatus.COMPLETED,
          progress: 0,
        }),
      }),
    )
    expect(dbMock.userEntry.update).not.toHaveBeenCalled()
    const body = await res.json()
    expect(body.status).toBe(WatchStatus.COMPLETED)
  })

  it('lazy-create defaults to PLAN_TO_WATCH when no status is supplied (TV_EPISODE)', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(null)
    dbMock.mediaItem.findUnique.mockResolvedValue({
      id: 'ep-1',
      type: MediaType.TV_EPISODE,
    })
    dbMock.userEntry.upsert.mockResolvedValue({
      id: 'new-entry-1',
      media_item_id: 'ep-1',
      status: WatchStatus.PLAN_TO_WATCH,
      user_rating: null,
      progress: 5,
      notes: null,
      started_at: null,
      completed_at: null,
      created_at: new Date('2026-05-15T12:00:00Z'),
      updated_at: new Date('2026-05-15T12:00:00Z'),
    })
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(putRequest({ mediaItemId: 'ep-1', progress: 5 }))
    expect(res.status).toBe(201)
    const call = dbMock.userEntry.upsert.mock.calls[0][0]
    expect(call.create.status).toBe(WatchStatus.PLAN_TO_WATCH)
    expect(call.create.progress).toBe(5)
  })

  it('updates status and returns the serialized entry', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(fixtureEntry())
    dbMock.userEntry.update.mockResolvedValue(
      fixtureEntry({
        status: WatchStatus.WATCHING,
        updated_at: new Date('2026-05-15T12:00:00Z'),
      }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'media-1', status: WatchStatus.WATCHING }),
    )
    expect(res.status).toBe(200)
    expect(dbMock.userEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { status: WatchStatus.WATCHING },
    })
    const body = await res.json()
    expect(body.status).toBe(WatchStatus.WATCHING)
    expect(body.mediaItemId).toBe('media-1')
    // Rating + notes were removed from the wire response in scope reduction.
    expect(body.userRating).toBeUndefined()
    expect(body.notes).toBeUndefined()
  })

  it('updates progress', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(fixtureEntry())
    dbMock.userEntry.update.mockResolvedValue(fixtureEntry({ progress: 12 }))
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'media-1', progress: 12 }),
    )
    expect(res.status).toBe(200)
    expect(dbMock.userEntry.update).toHaveBeenCalledWith({
      where: { id: 'entry-1' },
      data: { progress: 12 },
    })
  })

  it('updates completed_at as a Date when ISO string is sent', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(fixtureEntry())
    const completedAt = '2026-05-15T18:00:00.000Z'
    dbMock.userEntry.update.mockResolvedValue(
      fixtureEntry({
        status: WatchStatus.COMPLETED,
        completed_at: new Date(completedAt),
      }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({
        mediaItemId: 'media-1',
        status: WatchStatus.COMPLETED,
        completed_at: completedAt,
      }),
    )
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.completed_at).toBeInstanceOf(Date)
    expect((call.data.completed_at as Date).toISOString()).toBe(completedAt)
  })

  it('rejects user_rating in body (dropped from schema)', async () => {
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'media-1', user_rating: 7 }),
    )
    // No updatable fields → 400 empty_update (user_rating is ignored by Zod
    // strip-mode; the body has nothing the schema accepts beyond mediaItemId).
    expect(res.status).toBe(400)
  })

  it('rejects notes in body (dropped from schema)', async () => {
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'media-1', notes: 'rejected' }),
    )
    expect(res.status).toBe(400)
  })

  it('does not include unset fields in the update data', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(fixtureEntry())
    dbMock.userEntry.update.mockResolvedValue(
      fixtureEntry({ status: WatchStatus.WATCHING }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    await PUT(
      putRequest({ mediaItemId: 'media-1', status: WatchStatus.WATCHING }),
    )
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(Object.keys(call.data)).toEqual(['status'])
  })

  it('returns 405 on non-PUT requests via the wrapped handler shape', async () => {
    const { PUT } = await import('@/app/api/progress/route')
    const req = new NextRequest(new URL('http://localhost/api/progress'), {
      method: 'GET',
    })
    const res = await PUT(req)
    expect(res.status).toBe(405)
  })
})
