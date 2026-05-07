import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  db: { $queryRaw: vi.fn() },
}))
vi.mock('@/lib/redis', () => ({
  redis: { ping: vi.fn() },
}))
vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

import { GET } from '@/app/api/ready/route'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'

function makeReq() {
  return new NextRequest('http://localhost:3000/api/ready')
}

describe('GET /api/ready', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 when both DB and Redis are reachable', async () => {
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([{ '?column?': 1 }] as never)
    vi.mocked(redis.ping).mockResolvedValueOnce('PONG' as never)

    const response = await GET(makeReq())

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/application\/json/)
    expect(response.headers.get('cache-control')).toBe('no-store')

    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.db).toBe('ok')
    expect(body.redis).toBe('ok')
    expect(typeof body.uptime).toBe('number')
    expect(body.uptime).toBeGreaterThanOrEqual(0)
    expect(typeof body.timestamp).toBe('string')
    expect(Number.isNaN(new Date(body.timestamp).getTime())).toBe(false)

    expect(vi.mocked(logger.error)).not.toHaveBeenCalled()
  })

  it('returns 503 with db: fail when the DB check rejects', async () => {
    vi.mocked(db.$queryRaw).mockRejectedValueOnce(
      new Error('connection refused'),
    )
    vi.mocked(redis.ping).mockResolvedValueOnce('PONG' as never)

    const response = await GET(makeReq())

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toBe('no-store')

    const body = await response.json()
    expect(body.status).toBe('degraded')
    expect(body.db.startsWith('fail:')).toBe(true)
    expect(body.db).toContain('connection refused')
    expect(body.redis).toBe('ok')

    expect(vi.mocked(logger.error)).toHaveBeenCalledTimes(1)
    const [logArg] = vi.mocked(logger.error).mock.calls[0]
    expect((logArg as { event: string }).event).toBe('ready.check.fail')
  })

  it('returns 503 with redis: fail when the Redis check rejects', async () => {
    vi.mocked(db.$queryRaw).mockResolvedValueOnce([{ '?column?': 1 }] as never)
    vi.mocked(redis.ping).mockRejectedValueOnce(new Error('redis down'))

    const response = await GET(makeReq())

    expect(response.status).toBe(503)

    const body = await response.json()
    expect(body.status).toBe('degraded')
    expect(body.db).toBe('ok')
    expect(body.redis.startsWith('fail:')).toBe(true)
    expect(body.redis).toContain('redis down')
  })

  it('returns 503 with both fields failing when both checks reject', async () => {
    vi.mocked(db.$queryRaw).mockRejectedValueOnce(new Error('db gone'))
    vi.mocked(redis.ping).mockRejectedValueOnce(new Error('redis gone'))

    const response = await GET(makeReq())

    expect(response.status).toBe(503)

    const body = await response.json()
    expect(body.status).toBe('degraded')
    expect(body.db.startsWith('fail:')).toBe(true)
    expect(body.db).toContain('db gone')
    expect(body.redis.startsWith('fail:')).toBe(true)
    expect(body.redis).toContain('redis gone')
  })

  it('treats a check that exceeds 1000ms as failed (timeout)', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(db.$queryRaw).mockReturnValueOnce(
        new Promise(() => {}) as never,
      )
      vi.mocked(redis.ping).mockResolvedValueOnce('PONG' as never)

      const promise = GET(makeReq())
      await vi.advanceTimersByTimeAsync(1000)
      const response = await promise

      expect(response.status).toBe(503)
      const body = await response.json()
      expect(body.db).toMatch(/db timeout after 1000ms/)
      expect(body.redis).toBe('ok')
    } finally {
      vi.useRealTimers()
    }
  })
})
