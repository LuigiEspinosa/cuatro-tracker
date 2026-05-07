import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { withRequest } from '@/lib/request-context'

export const dynamic = 'force-dynamic'

const TIMEOUT_MS = 1000

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timeout after ${TIMEOUT_MS}ms`)),
        TIMEOUT_MS,
      ),
    ),
  ])
}

async function handler(_req: NextRequest) {
  const [dbRes, redisRes] = await Promise.allSettled([
    withTimeout(db.$queryRaw`SELECT 1`, 'db'),
    withTimeout(redis.ping(), 'redis'),
  ])

  const dbOk = dbRes.status === 'fulfilled'
  const redisOk = redisRes.status === 'fulfilled'
  const allOk = dbOk && redisOk

  const body = {
    status: allOk ? 'ok' : 'degraded',
    db: dbOk
      ? 'ok'
      : `fail: ${(dbRes as PromiseRejectedResult).reason?.message ?? 'unknown'}`,
    redis: redisOk
      ? 'ok'
      : `fail: ${(redisRes as PromiseRejectedResult).reason?.message ?? 'unknown'}`,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }

  if (!allOk) {
    logger.error({ event: 'ready.check.fail', body }, 'readiness check failed')
  }

  return NextResponse.json(body, {
    status: allOk ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export const GET = withRequest(handler)
