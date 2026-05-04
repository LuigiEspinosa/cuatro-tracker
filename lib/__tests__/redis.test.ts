import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type Redis from 'ioredis'

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

const createdClients: Redis[] = []

beforeEach(() => {
  vi.resetModules()
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
  delete (globalThis as unknown as { redis?: Redis }).redis
})

afterEach(() => {
  vi.unstubAllEnvs()
  for (const client of createdClients) client.disconnect()
  createdClients.length = 0
  delete (globalThis as unknown as { redis?: Redis }).redis
})

describe('lib/redis', () => {
  it('returns the same singleton across module re-evaluations (HMR cache via globalThis)', async () => {
    const first = (await import('@/lib/redis')).redis
    createdClients.push(first)

    vi.resetModules()

    const second = (await import('@/lib/redis')).redis
    expect(second).toBe(first)
  })
})
