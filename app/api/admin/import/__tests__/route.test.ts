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

const redisMock = vi.hoisted(() => ({
  set: vi.fn(),
  del: vi.fn(),
}))

vi.mock('@/lib/redis', () => ({ redis: redisMock }))

const queueAdd = vi.hoisted(() => vi.fn())

vi.mock('@/lib/jobs/queues', () => ({
  queues: [{ name: 'bulkImport', queue: { add: queueAdd } }],
}))

// Mock the job module to avoid pulling the processor's adapter/db graph into a
// route unit test; only the two constants the route imports are needed.
vi.mock('@/lib/jobs/bulkImport', () => ({
  BULK_IMPORT_QUEUE: 'bulkImport',
  BULK_IMPORT_FILE_PREFIX: 'bulkImport:file:',
}))

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
  vi.clearAllMocks()
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function importRequest(form: FormData): NextRequest {
  return new NextRequest(new URL('http://localhost/api/admin/import'), {
    method: 'POST',
    body: form,
  })
}

describe('POST /api/admin/import', () => {
  it('returns 400 when the format is missing or unrecognised', async () => {
    const form = new FormData()
    form.set('format', 'NOPE')
    form.set('file', new File(['{}'], 'x.json', { type: 'application/json' }))
    const { POST } = await import('@/app/api/admin/import/route')
    const res = await POST(importRequest(form))

    expect(res.status).toBe(400)
    expect((await res.json()).reason).toBe('bad_format')
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('returns 400 when the file is missing or empty', async () => {
    const form = new FormData()
    form.set('format', 'TRAKT_JSON')
    form.set('file', new File([], 'empty.json', { type: 'application/json' }))
    const { POST } = await import('@/app/api/admin/import/route')
    const res = await POST(importRequest(form))

    expect(res.status).toBe(400)
    expect((await res.json()).reason).toBe('empty_file')
  })

  it('returns 413 when the file exceeds MAX_IMPORT_BYTES', async () => {
    const { POST, MAX_IMPORT_BYTES } = await import(
      '@/app/api/admin/import/route'
    )
    const oversized = new Uint8Array(MAX_IMPORT_BYTES + 1)
    const form = new FormData()
    form.set('format', 'STEAM_EXPORT')
    form.set('file', new File([oversized], 'big.json', { type: 'application/json' }))
    const res = await POST(importRequest(form))

    expect(res.status).toBe(413)
    expect((await res.json()).error).toBe('file_too_large')
    expect(redisMock.set).not.toHaveBeenCalled()
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('persists the file to Redis with a TTL and enqueues the job, returning 202', async () => {
    const content = JSON.stringify({ response: { games: [] } })
    const form = new FormData()
    form.set('format', 'STEAM_EXPORT')
    form.set('file', new File([content], 'games.json', { type: 'application/json' }))
    const { POST } = await import('@/app/api/admin/import/route')
    const res = await POST(importRequest(form))

    expect(res.status).toBe(202)
    const body = await res.json()
    expect(typeof body.jobId).toBe('string')

    // File persisted under the per-job key with an expiry (not permanent).
    expect(redisMock.set).toHaveBeenCalledTimes(1)
    const [key, bytes, exFlag, ttl] = redisMock.set.mock.calls[0]!
    expect(key).toBe(`bulkImport:file:${body.jobId}`)
    expect(Buffer.isBuffer(bytes)).toBe(true)
    expect(exFlag).toBe('EX')
    expect(typeof ttl).toBe('number')

    // Job enqueued with the format + redisKey payload and the jobId as the id.
    expect(queueAdd).toHaveBeenCalledTimes(1)
    const [jobName, data, opts] = queueAdd.mock.calls[0]!
    expect(jobName).toBe('import')
    expect(data).toEqual({ format: 'STEAM_EXPORT', redisKey: key })
    expect(opts).toEqual({ jobId: body.jobId })
  })
})
