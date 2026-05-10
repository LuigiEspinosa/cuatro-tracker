// Shared Sentry beforeSend scrub for both server (instrumentation.ts), worker
// (worker.ts), and client (instrumentation-client.ts). Strips Authorization,
// Cookie, request body, user.email, and any field whose name matches the
// sensitive-keys list (case-insensitive) at any depth.

const SENSITIVE_HEADERS = ['authorization', 'cookie']

const SENSITIVE_FIELD_NAMES = [
  'password',
  'pwd',
  'passwd',
  'secret',
  'token',
  'apikey',
  'api_key',
  'authorization',
]

type SentryEvent = {
  user?: { email?: string }
  request?: {
    headers?: Record<string, unknown>
    data?: unknown
  }
}

export function scrubEvent<T extends SentryEvent>(event: T): T {
  if (event.user?.email) event.user.email = '[REDACTED]'

  if (event.request) {
    if (event.request.data) event.request.data = '[REDACTED]'
    if (event.request.headers) {
      for (const key of Object.keys(event.request.headers)) {
        if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
          event.request.headers[key] = '[REDACTED]'
        }
      }
    }
  }

  scrubField(event as unknown, new WeakSet())
  return event
}

function scrubField(obj: unknown, seen: WeakSet<object>): void {
  if (typeof obj !== 'object' || obj === null) return
  if (seen.has(obj)) return
  seen.add(obj)

  if (Array.isArray(obj)) {
    for (const item of obj) scrubField(item, seen)
    return
  }

  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELD_NAMES.includes(key.toLowerCase())) {
      ;(obj as Record<string, unknown>)[key] = '[REDACTED]'
    } else {
      scrubField(value, seen)
    }
  }
}
