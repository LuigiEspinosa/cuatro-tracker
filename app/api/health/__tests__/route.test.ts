import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  it('returns 200 with status, version, uptime, and ISO 8601 timestamp', async () => {
    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/application\/json/)

    const body = await response.json()

    expect(body.status).toBe('ok')
    expect(typeof body.version).toBe('string')
    expect(body.version.length).toBeGreaterThan(0)
    expect(typeof body.uptime).toBe('number')
    expect(body.uptime).toBeGreaterThanOrEqual(0)
    expect(typeof body.timestamp).toBe('string')
    expect(Number.isNaN(new Date(body.timestamp).getTime())).toBe(false)
  })

  it('sets Cache-Control: no-store', async () => {
    const response = await GET()
    expect(response.headers.get('cache-control')).toBe('no-store')
  })
})
