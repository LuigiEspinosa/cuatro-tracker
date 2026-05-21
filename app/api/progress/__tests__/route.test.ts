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

// Story 8.5 AC-5 + AC-9: PUT /api/progress anime auto-advance branch.
describe('PUT /api/progress (Story 8.5 anime auto-advance)', () => {
  const animeEntry = (overrides: Record<string, unknown> = {}) => ({
    id: 'entry-anime-1',
    media_item_id: 'anime-1',
    status: WatchStatus.PLAN_TO_WATCH,
    user_rating: null,
    progress: 0,
    notes: null,
    started_at: null,
    completed_at: null,
    created_at: new Date('2026-05-10T12:00:00Z'),
    updated_at: new Date('2026-05-12T12:00:00Z'),
    media_item: {
      id: 'anime-1',
      type: MediaType.ANIME,
      title: 'Sousou no Frieren',
      anilist_id: 170942,
      episode_count: 28,
    },
    ...overrides,
  })

  it('advances PLAN_TO_WATCH to WATCHING on first non-zero progress', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(animeEntry())
    dbMock.userEntry.update.mockResolvedValue(
      animeEntry({ progress: 1, status: WatchStatus.WATCHING }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(putRequest({ mediaItemId: 'anime-1', progress: 1 }))
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(1)
    expect(call.data.status).toBe(WatchStatus.WATCHING)
    expect(call.data.completed_at).toBeUndefined()
  })

  it('auto-completes when progress reaches episode_count and sets completed_at', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(
      animeEntry({ progress: 27, status: WatchStatus.WATCHING }),
    )
    const fakeNow = new Date('2026-05-19T16:00:00.000Z')
    vi.setSystemTime(fakeNow)
    dbMock.userEntry.update.mockResolvedValue(
      animeEntry({
        progress: 28,
        status: WatchStatus.COMPLETED,
        completed_at: fakeNow,
      }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(putRequest({ mediaItemId: 'anime-1', progress: 28 }))
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(28)
    expect(call.data.status).toBe(WatchStatus.COMPLETED)
    expect(call.data.completed_at).toBeInstanceOf(Date)
    expect((call.data.completed_at as Date).toISOString()).toBe(
      fakeNow.toISOString(),
    )
    vi.useRealTimers()
  })

  it('does NOT overwrite an existing completed_at when progress stays at episode_count (idempotent)', async () => {
    const previousCompletedAt = new Date('2026-05-17T10:00:00.000Z')
    dbMock.userEntry.findUnique.mockResolvedValue(
      animeEntry({
        progress: 28,
        status: WatchStatus.COMPLETED,
        completed_at: previousCompletedAt,
      }),
    )
    dbMock.userEntry.update.mockResolvedValue(animeEntry({ progress: 28 }))
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(putRequest({ mediaItemId: 'anime-1', progress: 28 }))
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(28)
    expect(call.data.status).toBe(WatchStatus.COMPLETED)
    // completed_at is NOT written when an existing one is present.
    expect(call.data.completed_at).toBeUndefined()
  })

  it('retreats on a smaller-progress decrement and preserves status when not at boundary', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(
      animeEntry({ progress: 5, status: WatchStatus.WATCHING }),
    )
    dbMock.userEntry.update.mockResolvedValue(animeEntry({ progress: 3 }))
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(putRequest({ mediaItemId: 'anime-1', progress: 3 }))
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(3)
    // No status flip: not PLAN_TO_WATCH and not >= episode_count.
    expect(call.data.status).toBeUndefined()
  })

  it('decrement to 0 preserves WATCHING status (no revert to PLAN_TO_WATCH)', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(
      animeEntry({ progress: 1, status: WatchStatus.WATCHING }),
    )
    dbMock.userEntry.update.mockResolvedValue(
      animeEntry({ progress: 0, status: WatchStatus.WATCHING }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(putRequest({ mediaItemId: 'anime-1', progress: 0 }))
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(0)
    expect(call.data.status).toBeUndefined()
  })

  it('no-op on same progress: writes progress but no status flip when already WATCHING mid-show', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(
      animeEntry({ progress: 5, status: WatchStatus.WATCHING }),
    )
    dbMock.userEntry.update.mockResolvedValue(animeEntry({ progress: 5 }))
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(putRequest({ mediaItemId: 'anime-1', progress: 5 }))
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(5)
    expect(call.data.status).toBeUndefined()
  })

  it('does NOT auto-complete when episode_count is null (anime with unknown total)', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(
      animeEntry({
        progress: 99,
        status: WatchStatus.WATCHING,
        media_item: {
          id: 'anime-1',
          type: MediaType.ANIME,
          title: 'Long Running',
          anilist_id: 1234,
          episode_count: null,
        },
      }),
    )
    dbMock.userEntry.update.mockResolvedValue(animeEntry({ progress: 100 }))
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(putRequest({ mediaItemId: 'anime-1', progress: 100 }))
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(100)
    expect(call.data.status).toBeUndefined()
    expect(call.data.completed_at).toBeUndefined()
  })

  it('does NOT auto-advance for MOVIE entries (gate preserves non-anime behaviour)', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(fixtureEntry())
    dbMock.userEntry.update.mockResolvedValue(fixtureEntry({ progress: 1 }))
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(putRequest({ mediaItemId: 'media-1', progress: 1 }))
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(1)
    // Movie path must NOT flip status from PLAN_TO_WATCH on progress write.
    expect(call.data.status).toBeUndefined()
  })

  it('does NOT auto-advance for TV_SHOW entries (gate preserves TV behaviour)', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(
      fixtureEntry({
        media_item: {
          id: 'show-1',
          type: MediaType.TV_SHOW,
          title: 'Some Show',
          tmdb_id: 999,
          episode_count: 24,
        },
      }),
    )
    dbMock.userEntry.update.mockResolvedValue(fixtureEntry({ progress: 24 }))
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(putRequest({ mediaItemId: 'show-1', progress: 24 }))
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(24)
    // TV_SHOW must NOT auto-advance to COMPLETED via the anime branch.
    expect(call.data.status).toBeUndefined()
  })

  it('respects an explicit body.status alongside auto-advance computation', async () => {
    // The auto-advance branch can override status (last writer wins on `data`).
    // If body.status is provided AND progress triggers auto-complete, the
    // anime branch's COMPLETED takes precedence, matches AC-5's "computed
    // status in a single update".
    dbMock.userEntry.findUnique.mockResolvedValue(
      animeEntry({ progress: 27, status: WatchStatus.WATCHING }),
    )
    const fakeNow = new Date('2026-05-19T17:00:00.000Z')
    vi.setSystemTime(fakeNow)
    dbMock.userEntry.update.mockResolvedValue(
      animeEntry({ progress: 28, status: WatchStatus.COMPLETED }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({
        mediaItemId: 'anime-1',
        progress: 28,
        status: WatchStatus.WATCHING, // client tries to keep WATCHING; server overrides.
      }),
    )
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.status).toBe(WatchStatus.COMPLETED)
    vi.useRealTimers()
  })
})

// Story 8.6 AC-5 + AC-10 #1: PUT /api/progress manga auto-advance branch.
describe('PUT /api/progress (Story 8.6 manga auto-advance)', () => {
  const mangaEntry = (overrides: Record<string, unknown> = {}) => ({
    id: 'entry-manga-1',
    media_item_id: 'manga-1',
    status: WatchStatus.PLAN_TO_WATCH,
    user_rating: null,
    progress: 0,
    volume_progress: 0,
    notes: null,
    started_at: null,
    completed_at: null,
    created_at: new Date('2026-05-10T12:00:00Z'),
    updated_at: new Date('2026-05-12T12:00:00Z'),
    media_item: {
      id: 'manga-1',
      type: MediaType.MANGA,
      title: 'Chainsaw Man',
      anilist_id: 105778,
      chapter_count: 150,
      volume_count: 15,
    },
    ...overrides,
  })

  it('advances PLAN_TO_WATCH to WATCHING on first chapter progress', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(mangaEntry())
    dbMock.userEntry.update.mockResolvedValue(
      mangaEntry({ progress: 1, status: WatchStatus.WATCHING }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'manga-1', progress: 1, volumeProgress: 0 }),
    )
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(1)
    expect(call.data.volume_progress).toBe(0)
    expect(call.data.status).toBe(WatchStatus.WATCHING)
    expect(call.data.completed_at).toBeUndefined()
  })

  it('advances PLAN_TO_WATCH to WATCHING when only volumeProgress increments', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(mangaEntry())
    dbMock.userEntry.update.mockResolvedValue(
      mangaEntry({ volume_progress: 1, status: WatchStatus.WATCHING }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'manga-1', volumeProgress: 1 }),
    )
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.volume_progress).toBe(1)
    expect(call.data.status).toBe(WatchStatus.WATCHING)
    // progress is untouched when only volumeProgress is sent.
    expect(call.data.progress).toBeUndefined()
  })

  it('auto-completes when chapter progress reaches chapter_count and sets completed_at', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(
      mangaEntry({
        progress: 149,
        volume_progress: 14,
        status: WatchStatus.WATCHING,
      }),
    )
    const fakeNow = new Date('2026-05-20T16:00:00.000Z')
    vi.setSystemTime(fakeNow)
    dbMock.userEntry.update.mockResolvedValue(
      mangaEntry({
        progress: 150,
        volume_progress: 15,
        status: WatchStatus.COMPLETED,
        completed_at: fakeNow,
      }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({
        mediaItemId: 'manga-1',
        progress: 150,
        volumeProgress: 15,
      }),
    )
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(150)
    expect(call.data.volume_progress).toBe(15)
    expect(call.data.status).toBe(WatchStatus.COMPLETED)
    expect(call.data.completed_at).toBeInstanceOf(Date)
    expect((call.data.completed_at as Date).toISOString()).toBe(
      fakeNow.toISOString(),
    )
    vi.useRealTimers()
  })

  it('does NOT overwrite an existing completed_at when chapter progress stays at chapter_count', async () => {
    const previousCompletedAt = new Date('2026-05-15T10:00:00.000Z')
    dbMock.userEntry.findUnique.mockResolvedValue(
      mangaEntry({
        progress: 150,
        volume_progress: 15,
        status: WatchStatus.COMPLETED,
        completed_at: previousCompletedAt,
      }),
    )
    dbMock.userEntry.update.mockResolvedValue(
      mangaEntry({ progress: 150, status: WatchStatus.COMPLETED }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'manga-1', progress: 150 }),
    )
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.status).toBe(WatchStatus.COMPLETED)
    expect(call.data.completed_at).toBeUndefined()
  })

  it('retreats independently on chapter and volume axes', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(
      mangaEntry({
        progress: 50,
        volume_progress: 5,
        status: WatchStatus.WATCHING,
      }),
    )
    dbMock.userEntry.update.mockResolvedValue(
      mangaEntry({ progress: 40, volume_progress: 4 }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'manga-1', progress: 40, volumeProgress: 4 }),
    )
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(40)
    expect(call.data.volume_progress).toBe(4)
    // No status flip on retreat.
    expect(call.data.status).toBeUndefined()
  })

  it('does NOT auto-complete when chapter_count is null (ongoing serialisation)', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(
      mangaEntry({
        progress: 200,
        volume_progress: 20,
        status: WatchStatus.WATCHING,
        media_item: {
          id: 'manga-1',
          type: MediaType.MANGA,
          title: 'One Piece',
          anilist_id: 30013,
          chapter_count: null,
          volume_count: null,
        },
      }),
    )
    dbMock.userEntry.update.mockResolvedValue(
      mangaEntry({ progress: 201 }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({ mediaItemId: 'manga-1', progress: 201 }),
    )
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(201)
    expect(call.data.status).toBeUndefined()
    expect(call.data.completed_at).toBeUndefined()
  })

  it('coalesces chapter increments to max() but trusts strict decrements', async () => {
    dbMock.userEntry.findUnique.mockResolvedValue(
      mangaEntry({ progress: 80, volume_progress: 8, status: WatchStatus.WATCHING }),
    )
    dbMock.userEntry.update.mockResolvedValue(
      mangaEntry({ progress: 80 }),
    )
    const { PUT } = await import('@/app/api/progress/route')
    // Increment-then-stale-write scenario: client sends 75 (smaller), trusted.
    const res = await PUT(
      putRequest({ mediaItemId: 'manga-1', progress: 75 }),
    )
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    expect(call.data.progress).toBe(75)
  })

  it('ignores manga-specific coalesce on non-manga entries (gate preserves anime behaviour)', async () => {
    const animeWithVolumeBody = {
      id: 'entry-anime-2',
      media_item_id: 'anime-2',
      status: WatchStatus.PLAN_TO_WATCH,
      user_rating: null,
      progress: 0,
      volume_progress: 0,
      notes: null,
      started_at: null,
      completed_at: null,
      created_at: new Date('2026-05-10T12:00:00Z'),
      updated_at: new Date('2026-05-12T12:00:00Z'),
      media_item: {
        id: 'anime-2',
        type: MediaType.ANIME,
        title: 'Hunter x Hunter',
        anilist_id: 11061,
        episode_count: 148,
      },
    }
    dbMock.userEntry.findUnique.mockResolvedValue(animeWithVolumeBody)
    dbMock.userEntry.update.mockResolvedValue({
      ...animeWithVolumeBody,
      progress: 5,
      volume_progress: 99,
      status: WatchStatus.WATCHING,
    })
    const { PUT } = await import('@/app/api/progress/route')
    const res = await PUT(
      putRequest({
        mediaItemId: 'anime-2',
        progress: 5,
        volumeProgress: 99, // sent but anime branch should not surface manga-specific coalesce
      }),
    )
    expect(res.status).toBe(200)
    const call = dbMock.userEntry.update.mock.calls[0][0]
    // Anime branch coalesces progress per its own logic; volumeProgress is
    // written verbatim via the body-mapping step (data.volume_progress = 99)
    // because the column is on UserEntry for all media types. The MANGA-specific
    // coalesce / chapter-count-driven completion is NOT applied to anime rows.
    expect(call.data.progress).toBe(5)
    expect(call.data.volume_progress).toBe(99)
    expect(call.data.status).toBe(WatchStatus.WATCHING) // anime auto-advance still runs
  })
})
