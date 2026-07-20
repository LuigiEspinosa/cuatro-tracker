import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRequest } from '@/lib/request-context'

export const dynamic = 'force-dynamic'

/* `POST /api/admin/merge/dismiss` (Story 11.4 AC-6): mark a suggestion
 * "not a duplicate".
 *
 * Sets resolved + dismissed + resolved_at on the row so the same pair never
 * resurfaces. No MediaItem and no UserEntry is mutated: a dismiss is a pure
 * flag update, the inverse of the accept path. Gated by the auth middleware
 * alongside the accept route.
 */

const DismissBodySchema = z.object({
  suggestionId: z.string().min(1),
})

function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

async function handler(req: NextRequest): Promise<NextResponse> {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    logger.warn(
      { event: 'admin.merge.dismiss.bad_request', reason: 'invalid_json' },
      'dismiss body was not valid JSON',
    )
    return jsonResponse({ error: 'invalid_body', reason: 'invalid_json' }, 400)
  }

  const parsed = DismissBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    logger.warn(
      { event: 'admin.merge.dismiss.bad_request', issues: parsed.error.issues },
      'dismiss body validation failed',
    )
    return jsonResponse(
      { error: 'invalid_body', issues: parsed.error.issues },
      400,
    )
  }

  const { suggestionId } = parsed.data

  const suggestion = await db.mergeSuggestion.findUnique({
    where: { id: suggestionId },
  })
  if (!suggestion || suggestion.resolved) {
    logger.warn(
      { event: 'admin.merge.dismiss.not_found', suggestionId },
      'dismiss target missing or already resolved',
    )
    return jsonResponse({ error: 'not_found' }, 404)
  }

  await db.mergeSuggestion.update({
    where: { id: suggestionId },
    data: { resolved: true, dismissed: true, resolved_at: new Date() },
  })

  const next = await db.mergeSuggestion.findFirst({
    where: { resolved: false },
    orderBy: { confidence: 'desc' },
    select: { id: true },
  })

  logger.info(
    { event: 'admin.merge.dismiss.ok', suggestionId, next: next?.id ?? null },
    'merge suggestion dismissed',
  )

  return jsonResponse({ resolvedId: suggestionId, next: next?.id ?? null }, 200)
}

export const POST = withRequest<NextRequest, NextResponse>(handler)
