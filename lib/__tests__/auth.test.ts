import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'

vi.mock('@/lib/db', () => ({
  db: { user: { findUnique: vi.fn() } },
}))

import { db } from '@/lib/db'
import { authorizeCredentials } from '@/lib/auth'

const findUnique = vi.mocked(db.user.findUnique)

// bcrypt is slow - pre-hash once with minimal rounds for the whole suite
let validHash: string
beforeAll(async () => {
  validHash = await bcrypt.hash('correct', 4)
})

beforeEach(() => vi.clearAllMocks())

describe('authorizeCredentials', () => {
  it('returns null when credentials are undefined', async () => {
    expect(await authorizeCredentials(undefined)).toBeNull()
  })

  it('returns null when email or password are empty', async () => {
    expect(await authorizeCredentials({ email: '', password: 'x' })).toBeNull()
    expect(
      await authorizeCredentials({ email: 'a@b.com', password: '' }),
    ).toBeNull()
  })

  it('returns null when user does not exist', async () => {
    findUnique.mockResolvedValue(null)
    expect(
      await authorizeCredentials({ email: 'a@b.com', password: 'x' }),
    ).toBeNull()
  })

  it('returns null when password does not match', async () => {
    findUnique.mockResolvedValue({
      id: '1',
      email: 'a@b.com',
      name: 'Admin',
      password: validHash,
    } as Awaited<ReturnType<typeof db.user.findUnique>>)
    expect(
      await authorizeCredentials({ email: 'a@b.com', password: 'wrong' }),
    ).toBeNull()
  })

  it('returns the user object when credentials are valid', async () => {
    findUnique.mockResolvedValue({
      id: '1',
      email: 'a@b.com',
      name: 'Admin',
      password: validHash,
    } as Awaited<ReturnType<typeof db.user.findUnique>>)
    expect(
      await authorizeCredentials({ email: 'a@b.com', password: 'correct' }),
    ).toEqual({
      id: '1',
      email: 'a@b.com',
      name: 'Admin',
    })
  })
})
