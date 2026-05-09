import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { ZodError } from 'zod'

const { logWarn } = vi.hoisted(() => ({ logWarn: vi.fn() }))

vi.mock('@/lib/db', () => ({
  db: { user: { findUnique: vi.fn() } },
}))

vi.mock('@/lib/logger', () => ({
  logger: { warn: logWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
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

  it('propagates findUnique rejection so DB-down stays unmasked', async () => {
    const { db } = await import('@/lib/db')
    vi.mocked(db.user.findUnique).mockRejectedValue(
      new Error('Connection refused'),
    )
    const { authorizeCredentials } = await import('@/lib/auth')

    await expect(
      authorizeCredentials({ email: 'a@b.com', password: 'x' }),
    ).rejects.toThrow()
    expect(logWarn).not.toHaveBeenCalled()
  })

  it('normalises email to trim() + toLowerCase() before findUnique', async () => {
    const { db } = await import('@/lib/db')
    vi.mocked(db.user.findUnique).mockResolvedValue(null)
    const { authorizeCredentials } = await import('@/lib/auth')

    await authorizeCredentials({ email: '  A@B.com ', password: 'x' })

    expect(db.user.findUnique).toHaveBeenCalledTimes(1)
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'a@b.com' },
      select: { id: true, email: true, name: true, password: true },
    })
  })

  it('returns null when user exists but password column is null (OAuth-only user)', async () => {
    const { db } = await import('@/lib/db')
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: '1',
      email: 'a@b.com',
      name: 'Admin',
      password: null,
    } as Awaited<ReturnType<typeof db.user.findUnique>>)
    const { authorizeCredentials } = await import('@/lib/auth')

    const result = await authorizeCredentials({
      email: 'a@b.com',
      password: 'x',
    })

    expect(result).toBeNull()
    expect(logWarn).not.toHaveBeenCalled()
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

  it('returns null and warn-logs when bcrypt.compare throws on a malformed hash', async () => {
    const { db } = await import('@/lib/db')
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: '1',
      email: 'a@b.com',
      name: 'Admin',
      // 60 chars trips bcryptjs past the length short-circuit (returns false for length != 60)
      // into the salt-version check, which throws Error('Invalid salt version: aa').
      password: 'a'.repeat(60),
    } as Awaited<ReturnType<typeof db.user.findUnique>>)
    const { authorizeCredentials } = await import('@/lib/auth')

    const result = await authorizeCredentials({
      email: 'a@b.com',
      password: 'whatever',
    })

    expect(result).toBeNull()
    expect(logWarn).toHaveBeenCalledTimes(1)
    expect(logWarn).toHaveBeenCalledWith(
      {
        userId: '1',
        event: 'auth.bcrypt_compare_error',
        err: expect.any(Error),
      },
      'bcrypt.compare threw on malformed hash',
    )
  })

  it('returns null without logging when stored hash has wrong length (bcryptjs short-circuits to false)', async () => {
    const { db } = await import('@/lib/db')
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: '1',
      email: 'a@b.com',
      name: 'Admin',
      // 59 chars (anything != 60) trips the length short-circuit branch in bcryptjs
      // which returns false synchronously without entering the salt-version check.
      // The catch must NOT fire on this path.
      password: 'a'.repeat(59),
    } as Awaited<ReturnType<typeof db.user.findUnique>>)
    const { authorizeCredentials } = await import('@/lib/auth')

    const result = await authorizeCredentials({
      email: 'a@b.com',
      password: 'whatever',
    })

    expect(result).toBeNull()
    expect(logWarn).not.toHaveBeenCalled()
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

describe('authOptions.callbacks.session', () => {
  it('returns the session with token.id assigned when token.id is a string', async () => {
    const { authOptions } = await import('@/lib/auth')
    const result = authOptions.callbacks!.session!({
      session: { user: { email: 'a@b.com', name: null, id: '' }, expires: '' },
      token: { id: 'user-uuid' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((result as any).user.id).toBe('user-uuid')
  })

  it.each([
    { label: 'undefined', value: undefined },
    { label: 'a number', value: 42 },
    { label: 'an object', value: {} },
    { label: 'an empty string', value: '' },
  ])(
    'throws Error("invalid token.id") when token.id is $label',
    async ({ value }) => {
      const { authOptions } = await import('@/lib/auth')
      expect(() =>
        authOptions.callbacks!.session!({
          session: { user: { email: 'a@b.com', name: null, id: '' }, expires: '' },
          token: { id: value },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any),
      ).toThrow('invalid token.id')
    },
  )
})
