import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { attachRequestId } from '@/middleware'

const UUID_REGEX = /^[0-9a-f-]{36}$/i

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/timeline', { headers })
}

describe('middleware attachRequestId', () => {
  it('generates a UUID when no inbound x-Request-Id is present', () => {
    const res = attachRequestId(makeRequest())
    const id = res.headers.get('x-request-id')
    expect(id).not.toBeNull()
    expect(UUID_REGEX.test(id!)).toBe(true)
  })

  it('reuses an inbound X-Request-Id that matches the UUID shape', () => {
    const inbound = '11111111-2222-3333-4444-555555555555'
    const res = attachRequestId(makeRequest({ 'x-request-id': inbound }))
    expect(res.headers.get('x-request-id')).toBe(inbound)
  })

  it('rejects a malformed inbound X-Request-Id and generates a fresh one', () => {
    const res = attachRequestId(
      makeRequest({ 'x-request-id': 'not-a-uuid; drop table users' }),
    )
    const id = res.headers.get('x-request-id')
    expect(id).not.toBe('not-a-uuid; drop table users')
    expect(UUID_REGEX.test(id!)).toBe(true)
  })
})
