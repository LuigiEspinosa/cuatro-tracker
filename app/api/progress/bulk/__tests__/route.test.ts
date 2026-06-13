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

const txMock = vi.hoisted(() => ({
  userEntry: { upsert: vi.fn() },
}))

const dbMock = vi.hoisted(() => ({
  mediaItem: { findMany: vi.fn() },
  userEntry: { findMany: vi.fn() },
  $transaction: vi.fn(),
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
  dbMock.$transaction.mockImplementation(
    async (fn: (tx: typeof txMock) => Promise<unknown>) => fn(txMock),
  )
  // No pre-existing UserEntries unless a test seeds them.
  dbMock.userEntry.findMany.mockResolvedValue([])
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function postRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/progress/bulk'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('POST /api/progress/bulk', () => {
  it('rejects scope=season without seasonNumber with 400', async () => {
    const { POST } = await import('@/app/api/progress/bulk/route')
    const res = await POST(
      postRequest({
        parentId: 'show-1',
        scope: 'season',
        status: WatchStatus.COMPLETED,
      }),
    )
    expect(res.status).toBe(400)
  })

  it('rejects invalid JSON with 400', async () => {
    const { POST } = await import('@/app/api/progress/bulk/route')
    const req = new NextRequest(new URL('http://localhost/api/progress/bulk'), {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 405 on GET', async () => {
    const { POST } = await import('@/app/api/progress/bulk/route')
    const req = new NextRequest(new URL('http://localhost/api/progress/bulk'), {
      method: 'GET',
    })
    const res = await POST(req)
    expect(res.status).toBe(405)
  })

  it('upserts a UserEntry for each aired episode in a season, returns the count', async () => {
    dbMock.mediaItem.findMany.mockResolvedValue([
      { id: 'ep-s2e1' },
      { id: 'ep-s2e2' },
      { id: 'ep-s2e3' },
    ])
    txMock.userEntry.upsert.mockResolvedValue({})
    const { POST } = await import('@/app/api/progress/bulk/route')

    const res = await POST(
      postRequest({
        parentId: 'show-1',
        scope: 'season',
        seasonNumber: 2,
        status: WatchStatus.COMPLETED,
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ updated: 3 })
    expect(dbMock.mediaItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          parent_id: 'show-1',
          type: MediaType.TV_EPISODE,
          unaired: false,
          season_number: 2,
        },
        select: { id: true },
      }),
    )
    expect(txMock.userEntry.upsert).toHaveBeenCalledTimes(3)
    const firstCall = txMock.userEntry.upsert.mock.calls[0][0]
    expect(firstCall.where).toEqual({ media_item_id: 'ep-s2e1' })
    expect(firstCall.create).toEqual(
      expect.objectContaining({
        media_item_id: 'ep-s2e1',
        status: WatchStatus.COMPLETED,
        progress: 0,
      }),
    )
    expect(firstCall.update).toEqual(
      expect.objectContaining({ status: WatchStatus.COMPLETED }),
    )
    // ECH-T20: COMPLETED bulk mark stamps completed_at on create and update.
    expect(firstCall.create.completed_at).toBeInstanceOf(Date)
    expect(firstCall.update.completed_at).toBeInstanceOf(Date)
  })

  it('preserves an existing completed_at on a COMPLETED re-mark (idempotent bulk)', async () => {
    const original = new Date('2026-04-01T20:00:00.000Z')
    dbMock.mediaItem.findMany.mockResolvedValue([
      { id: 'ep-1' },
      { id: 'ep-2' },
    ])
    // ep-1 was completed individually before the bulk mark; ep-2 has an entry
    // but never completed.
    dbMock.userEntry.findMany.mockResolvedValue([
      { media_item_id: 'ep-1', completed_at: original },
      { media_item_id: 'ep-2', completed_at: null },
    ])
    txMock.userEntry.upsert.mockResolvedValue({})
    const { POST } = await import('@/app/api/progress/bulk/route')

    await POST(
      postRequest({
        parentId: 'show-1',
        scope: 'show',
        status: WatchStatus.COMPLETED,
      }),
    )

    const first = txMock.userEntry.upsert.mock.calls[0][0]
    const second = txMock.userEntry.upsert.mock.calls[1][0]
    // ep-1 keeps its original watch date; ep-2 gets the fresh batch stamp.
    expect(first.update.completed_at).toBe(original)
    expect(second.update.completed_at).toBeInstanceOf(Date)
    expect(second.update.completed_at).not.toBe(original)
  })

  it('clears completed_at when the bulk target status is not COMPLETED (ECH-T20)', async () => {
    dbMock.mediaItem.findMany.mockResolvedValue([{ id: 'ep-1' }])
    txMock.userEntry.upsert.mockResolvedValue({})
    const { POST } = await import('@/app/api/progress/bulk/route')

    await POST(
      postRequest({
        parentId: 'show-1',
        scope: 'show',
        status: WatchStatus.PLAN_TO_WATCH,
      }),
    )

    const call = txMock.userEntry.upsert.mock.calls[0][0]
    expect(call.create.completed_at).toBeNull()
    expect(call.update.completed_at).toBeNull()
  })

  it('upserts all aired episodes for scope=show (no season_number filter)', async () => {
    dbMock.mediaItem.findMany.mockResolvedValue([
      { id: 'ep-1' },
      { id: 'ep-2' },
    ])
    txMock.userEntry.upsert.mockResolvedValue({})
    const { POST } = await import('@/app/api/progress/bulk/route')

    const res = await POST(
      postRequest({
        parentId: 'show-1',
        scope: 'show',
        status: WatchStatus.COMPLETED,
      }),
    )

    expect(res.status).toBe(200)
    const where = dbMock.mediaItem.findMany.mock.calls[0][0].where
    expect(where).toEqual({
      parent_id: 'show-1',
      type: MediaType.TV_EPISODE,
      unaired: false,
    })
    expect(where.season_number).toBeUndefined()
  })

  it('returns updated: 0 + no transaction when no aired episodes match', async () => {
    dbMock.mediaItem.findMany.mockResolvedValue([])
    const { POST } = await import('@/app/api/progress/bulk/route')

    const res = await POST(
      postRequest({
        parentId: 'show-1',
        scope: 'season',
        seasonNumber: 99,
        status: WatchStatus.COMPLETED,
      }),
    )

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.updated).toBe(0)
    expect(dbMock.$transaction).not.toHaveBeenCalled()
  })

  it('propagates a transaction rollback when an upsert rejects mid-flight', async () => {
    dbMock.mediaItem.findMany.mockResolvedValue([
      { id: 'ep-1' },
      { id: 'ep-2' },
    ])
    // First upsert succeeds; second rejects. Real Prisma rolls back the whole
    // transaction on any throw inside the callback. The mock's `$transaction`
    // re-throws what the callback throws; the route's outer error handler
    // surfaces a non-2xx response (here the rejection bubbles to withRequest).
    txMock.userEntry.upsert
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('row lock timeout'))
    const { POST } = await import('@/app/api/progress/bulk/route')

    await expect(
      POST(
        postRequest({
          parentId: 'show-1',
          scope: 'show',
          status: WatchStatus.COMPLETED,
        }),
      ),
    ).rejects.toThrow('row lock timeout')
    // No `updated` response was emitted; the route handler didn't reach the
    // success path.
    expect(txMock.userEntry.upsert).toHaveBeenCalledTimes(2)
  })

  it('passes the 30s timeout to db.$transaction', async () => {
    dbMock.mediaItem.findMany.mockResolvedValue([{ id: 'ep-1' }])
    txMock.userEntry.upsert.mockResolvedValue({})
    const { POST } = await import('@/app/api/progress/bulk/route')

    await POST(
      postRequest({
        parentId: 'show-1',
        scope: 'show',
        status: WatchStatus.COMPLETED,
      }),
    )

    expect(dbMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: 30_000 }),
    )
  })
})
