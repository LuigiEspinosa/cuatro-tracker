import type { z } from 'zod'

// Summarise a ZodError into structured issue metadata WITHOUT the raw input.
// Zod v4 issues carry `received`/`input` fields that snapshot the rejected
// payload — logging the full error therefore leaks upstream-API response
// bodies (e.g., a malformed Twitch token response could ship the access_token
// itself to the log stream). This helper drops `input` and keeps only the
// structural information needed for observability.
export function summariseZodError(err: z.ZodError): {
  issues: Array<{ path: string; code: string; message: string }>
} {
  return {
    issues: err.issues.map((issue) => ({
      path: issue.path.join('.') || '(root)',
      code: issue.code,
      message: issue.message,
    })),
  }
}

// Parse an HTTP `Retry-After` header value into milliseconds.
// Per RFC 7231 it can be either delta-seconds or an HTTP-date. Returns
// `undefined` when the header is absent or unparseable.
export function parseRetryAfter(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined
  const asNumber = Number(headerValue)
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return asNumber * 1000
  }
  const asDate = Date.parse(headerValue)
  if (!Number.isNaN(asDate)) {
    const diff = asDate - Date.now()
    return diff > 0 ? diff : 0
  }
  return undefined
}
