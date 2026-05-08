import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { ZodError } from 'zod'

vi.mock('@/lib/db', () => ({
  db: { user: { findUnique: vi.fn() } },
}))

// validEnv must mirror the required fields in lib/env.ts EnvSchema.
// Drift here means env validation fires inside vi.resetModules() and tests
// fail for the wrong reason. Update both files together.
const validEnv: Record<string, string> = {
  NEXTAUTH_SECRET: 'a'.repeat(64),
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

let validHash: string
// bcrypt is slow, pre-hash once with minimal rounds for the whole suite
beforeAll(async () => {
  validHash = await bcrypt.hash('correct', 4)
})

beforeEach(() => {
  vi.resetModules()
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('authorizeCredentials', () => {
  it('returns null when credentials are undefined', async () => {
    const { authorizeCredentials } = await import('@/lib/auth')
    expect(await authorizeCredentials(undefined)).toBeNull()
  })

  it('returns null when email or password are empty', async () => {
    const { authorizeCredentials } = await import('@/lib/auth')
    expect(
      await authorizeCredentials({ email: '', password: 'x' }),
    ).toBeNull()
    expect(
      await authorizeCredentials({ email: 'a@b.com', password: '' }),
    ).toBeNull()
  })

  it('returns null when user does not exist', async () => {
    const { db } = await import('@/lib/db')
    vi.mocked(db.user.findUnique).mockResolvedValue(null)
    const { authorizeCredentials } = await import('@/lib/auth')
    expect(
      await authorizeCredentials({ email: 'a@b.com', password: 'x' }),
    ).toBeNull()
  })

  it('returns null when password does not match', async () => {
    const { db } = await import('@/lib/db')
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: '1',
      email: 'a@b.com',
      name: 'Admin',
      password: validHash,
    } as Awaited<ReturnType<typeof db.user.findUnique>>)
    const { authorizeCredentials } = await import('@/lib/auth')
    expect(
      await authorizeCredentials({ email: 'a@b.com', password: 'wrong' }),
    ).toBeNull()
  })

  it('returns the user object when credentials are valid', async () => {
    const { db } = await import('@/lib/db')
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: '1',
      email: 'a@b.com',
      name: 'Admin',
      password: validHash,
    } as Awaited<ReturnType<typeof db.user.findUnique>>)
    const { authorizeCredentials } = await import('@/lib/auth')
    expect(
      await authorizeCredentials({ email: 'a@b.com', password: 'correct' }),
    ).toEqual({
      id: '1',
      email: 'a@b.com',
      name: 'Admin',
    })
  })
})

describe('authOptions wiring', () => {
  it('reads secret from the validated env, not raw process.env', async () => {
    // Sentinel value distinct from validEnv.NEXTAUTH_SECRET so the assertion
    // proves authOptions.secret flowed through @/lib/env, not the raw stubbed
    // process.env that NextAuth would read on its own if `secret:` were unwired.
    const sentinel = 's'.repeat(40)
    vi.doMock('@/lib/env', () => ({
      env: { NEXTAUTH_SECRET: sentinel },
    }))

    const { authOptions } = await import('@/lib/auth')
    expect(authOptions.secret).toBe(sentinel)
    expect(authOptions.secret).not.toBe(validEnv.NEXTAUTH_SECRET)

    vi.doUnmock('@/lib/env')
  })

  it.each([
    { label: 'empty string', value: '' },
    { label: 'short string', value: 'short' },
  ])(
    'throws ZodError at module-load when NEXTAUTH_SECRET is $label',
    async ({ value }) => {
      vi.stubEnv('NEXTAUTH_SECRET', value)

      let caught: unknown
      try {
        await import('@/lib/auth')
      } catch (err) {
        caught = err
      }

      expect(caught).toBeInstanceOf(ZodError)
      const issues = (caught as ZodError).issues
      const secretIssue = issues.find((i) => i.path.includes('NEXTAUTH_SECRET'))
      expect(secretIssue).toBeDefined()
      expect(secretIssue?.code).toBe('too_small')
    },
  )
})
