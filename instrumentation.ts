import { env } from '@/lib/env'
import { scrubEvent } from '@/lib/sentry-scrub'

export async function register() {
  if (!env.SENTRY_DSN) return

  const Sentry = await import('@sentry/nextjs')
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubEvent(event)
    },
  })
}
