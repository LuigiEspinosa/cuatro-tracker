import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { logger } from '@/lib/logger'
import { withRequest } from '@/lib/request-context'
import {
  ADAPTERS,
  dedupResults,
  type SearchType,
  type UnifiedSearchResult,
} from '@/lib/search/federation'

export const dynamic = 'force-dynamic'

const SearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  type: z.enum(['movie', 'tv', 'anime', 'manga', 'game']).optional(),
})

async function handler(req: NextRequest): Promise<NextResponse> {
  const params = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = SearchQuerySchema.safeParse(params)

  if (!parsed.success) {
    logger.warn(
      { event: 'search.bad_request', issues: parsed.error.issues },
      'search query validation failed',
    )
    return NextResponse.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const { q, type } = parsed.data

  const dispatched = ADAPTERS.filter(
    (adapter) => type === undefined || adapter.supportedTypes.includes(type),
  )

  const settled = await Promise.allSettled(
    dispatched.map(async (adapter) => {
      const startedAt = Date.now()
      try {
        const results = await adapter.search(q, type)
        return { source: adapter.source, results }
      } catch (err) {
        logger.warn(
          {
            event: 'search.adapter_failed',
            source: adapter.source,
            durationMs: Date.now() - startedAt,
            err,
          },
          'search adapter rejected',
        )
        throw err
      }
    }),
  )

  const successes: UnifiedSearchResult[] = []
  let failureCount = 0
  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      successes.push(...outcome.value.results)
    } else {
      failureCount += 1
    }
  }

  const results = dedupResults(successes)
  const partialFailure = failureCount > 0

  return NextResponse.json(
    { results, partialFailure },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  )
}

export const GET = withRequest<NextRequest, NextResponse>(handler)
export type { SearchType, UnifiedSearchResult }
