import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'

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
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'))
}

describe('GET /api/dashboard/up-next', () => {
  it('returns 200 with empty items array (Epic 5 stub: movies have no next-X semantics)', async () => {
    const { GET } = await import('@/app/api/dashboard/up-next/route')
    const res = await GET(makeRequest('/api/dashboard/up-next'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ items: [] })
  })

  it('sets Cache-Control: no-store', async () => {
    const { GET } = await import('@/app/api/dashboard/up-next/route')
    const res = await GET(makeRequest('/api/dashboard/up-next'))
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})
