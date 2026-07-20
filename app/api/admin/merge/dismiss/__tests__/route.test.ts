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

const dbMock = vi.hoisted(() => ({
  mergeSuggestion: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  userEntry: {
    update: vi.fn(),
    delete: vi.fn(),
  },
  mediaItem: {
    delete: vi.fn(),
    updateMany: vi.fn(),
  },
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
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function postRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/admin/merge/dismiss'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function newSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sug_1',
    source_id: 'src_1',
    target_id: 'tgt_1',
    confidence: 0.9,
    resolved: false,
    dismissed: false,
    resolved_at: null,
    created_at: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  }
}

describe('POST /api/admin/merge/dismiss', () => {
  it('returns 400 when suggestionId is missing', async () => {
    const { POST } = await import('@/app/api/admin/merge/dismiss/route')
    const res = await POST(postRequest({}))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_body')
  })

  it('returns 404 when the suggestion does not exist', async () => {
    dbMock.mergeSuggestion.findUnique.mockResolvedValue(null)
    const { POST } = await import('@/app/api/admin/merge/dismiss/route')
    const res = await POST(postRequest({ suggestionId: 'sug_1' }))

    expect(res.status).toBe(404)
    expect(dbMock.mergeSuggestion.update).not.toHaveBeenCalled()
  })

  it('returns 404 when the suggestion is already resolved', async () => {
    dbMock.mergeSuggestion.findUnique.mockResolvedValue(
      newSuggestion({ resolved: true }),
    )
    const { POST } = await import('@/app/api/admin/merge/dismiss/route')
    const res = await POST(postRequest({ suggestionId: 'sug_1' }))

    expect(res.status).toBe(404)
    expect(dbMock.mergeSuggestion.update).not.toHaveBeenCalled()
  })

  it('sets resolved + dismissed + resolved_at and mutates nothing else', async () => {
    dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
    dbMock.mergeSuggestion.findFirst.mockResolvedValue({ id: 'sug_2' })
    const { POST } = await import('@/app/api/admin/merge/dismiss/route')
    const res = await POST(postRequest({ suggestionId: 'sug_1' }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ resolvedId: 'sug_1', next: 'sug_2' })

    const call = dbMock.mergeSuggestion.update.mock.calls[0][0]
    expect(call.where).toEqual({ id: 'sug_1' })
    expect(call.data.resolved).toBe(true)
    expect(call.data.dismissed).toBe(true)
    expect(call.data.resolved_at).toBeInstanceOf(Date)

    // A dismiss must not touch any MediaItem or UserEntry.
    expect(dbMock.mediaItem.delete).not.toHaveBeenCalled()
    expect(dbMock.mediaItem.updateMany).not.toHaveBeenCalled()
    expect(dbMock.userEntry.update).not.toHaveBeenCalled()
    expect(dbMock.userEntry.delete).not.toHaveBeenCalled()
    expect(dbMock.$transaction).not.toHaveBeenCalled()
  })
})
