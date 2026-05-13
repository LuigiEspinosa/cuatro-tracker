import { describe, it, expect } from 'vitest'
import { config } from '@/middleware'

const matcher = new RegExp(`^${config.matcher[0]}$`)

type Case = { path: string; expected: 'gate' | 'bypass' }

const cases: Case[] = [
  { path: '/login', expected: 'bypass' },
  { path: '/login/', expected: 'bypass' },
  { path: '/login/foo', expected: 'bypass' },
  { path: '/loginz', expected: 'gate' },
  { path: '/login-but-different', expected: 'gate' },

  { path: '/api/auth', expected: 'bypass' },
  { path: '/api/auth/callback/credentials', expected: 'bypass' },
  { path: '/api/auth/session', expected: 'bypass' },
  { path: '/api/authentication', expected: 'gate' },

  { path: '/api/health', expected: 'bypass' },
  { path: '/api/healthcheck', expected: 'gate' },
  { path: '/api/health-check', expected: 'gate' },

  { path: '/api/ready', expected: 'bypass' },
  { path: '/api/readiness', expected: 'gate' },

  { path: '/_next/static/chunks/main.js', expected: 'bypass' },
  { path: '/_next/image', expected: 'bypass' },

  { path: '/favicon.ico', expected: 'bypass' },
  { path: '/faviconxico', expected: 'gate' },
  { path: '/robots.txt', expected: 'bypass' },
  { path: '/robotsxtxt', expected: 'gate' },
  { path: '/sitemap.xml', expected: 'bypass' },
  { path: '/manifest.webmanifest', expected: 'bypass' },

  { path: '/dashboard', expected: 'gate' },
  { path: '/timeline', expected: 'gate' },
  { path: '/api/media', expected: 'gate' },
  { path: '/api/search', expected: 'gate' },
  { path: '/api/search/foo', expected: 'gate' },
]

describe('middleware matcher', () => {
  it.each(cases)('$path -> $expected', ({ path, expected }) => {
    const matched = matcher.test(path)
    expect(matched).toBe(expected === 'gate')
  })
})
