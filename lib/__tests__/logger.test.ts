import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { DestinationStream } from 'pino'
import { createLogger } from '@/lib/logger'

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

function captureStream(): { stream: DestinationStream; lines: string[] } {
  const lines: string[] = []
  const stream: DestinationStream = {
    write(chunk: string) {
      lines.push(chunk)
    },
  }
  return { stream, lines }
}

describe('lib/logger redaction', () => {
  it('replaces password, authorization, cookie, token, and apiKey with [REDACTED] at top level and one nested level', async () => {
    const { stream, lines } = captureStream()
    const { createLogger } = await import('@/lib/logger')
    const log = createLogger(stream)

    log.info(
      {
        password: 'hunter2',
        token: 'top-level-token',
        apiKey: 'top-level-apikey',
        headers: {
          authorization: 'Bearer secret-token',
          cookie: 'session=abc',
        },
        nested: {
          password: 'nested-pw',
          token: 'sk_live_xxx',
          apiKey: 'ak_live_yyy',
        },
      },
      'login attempt',
    )

    const output = lines.join('')
    const parsed = JSON.parse(output)

    expect(parsed.password).toBe('[REDACTED]')
    expect(parsed.token).toBe('[REDACTED]')
    expect(parsed.apiKey).toBe('[REDACTED]')
    expect(parsed.headers.authorization).toBe('[REDACTED]')
    expect(parsed.headers.cookie).toBe('[REDACTED]')
    expect(parsed.nested.password).toBe('[REDACTED]')
    expect(parsed.nested.token).toBe('[REDACTED]')
    expect(parsed.nested.apiKey).toBe('[REDACTED]')

    expect(output).not.toContain('hunter2')
    expect(output).not.toContain('top-level-token')
    expect(output).not.toContain('top-level-apikey')
    expect(output).not.toContain('Bearer secret-token')
    expect(output).not.toContain('sk_live_xxx')
    expect(output).not.toContain('ak_live_yyy')
  })

  it('emits requestId from AsyncLocalStorage when present', async () => {
    const { stream, lines } = captureStream()
    const { createLogger } = await import('@/lib/logger')
    const { requestContext } = await import('@/lib/request-context')
    const log = createLogger(stream)

    requestContext.run({ requestId: 'fixed-request-id-1234' }, () => {
      log.info({ event: 'test' }, 'inside als')
    })

    log.info({ event: 'test' }, 'outside als')

    expect(JSON.parse(lines[0]).requestId).toBe('fixed-request-id-1234')
    expect(JSON.parse(lines[1]).requestId).toBeUndefined()
  })
})
