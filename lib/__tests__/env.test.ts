import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ZodError } from 'zod'

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
}

beforeEach(() => {
  vi.resetModules()
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('lib/env', () => {
  it('parses a fully-populated env without throwing', async () => {
    const mod = await import('@/lib/env')
    expect(mod.env.NEXTAUTH_SECRET).toBe('a'.repeat(32))
    expect(mod.env.NEXTAUTH_URL).toBe('http://localhost:3000')
    expect(mod.env.QBITTORRENT_HOST).toBe('http://qbittorrent:8080')
    expect(mod.env.NODE_ENV).toBe('test')
    expect(mod.env.CLOUDFLARE_API_TOKEN).toBeUndefined()
  })

  it('throws ZodError when a required var is missing', async () => {
    vi.stubEnv('NEXTAUTH_SECRET', '')

    let caught: unknown
    try {
      await import('@/lib/env')
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(ZodError)
    const issues = (caught as ZodError).issues
    expect(issues.some((i) => i.path.includes('NEXTAUTH_SECRET'))).toBe(true)
  })
})
