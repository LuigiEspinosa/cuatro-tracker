import { NextResponse, type NextRequest } from 'next/server'
import { MediaType, WatchStatus, type Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRequest } from '@/lib/request-context'

export const dynamic = 'force-dynamic'

/* `POST /api/progress/bulk`: transactional UserEntry upserts for a season or
 * a whole TV show. Powers the SeasonAccordion's "Mark Season Watched" and
 * "Mark Show Watched" actions from Story 7.5. Single-transaction shape so
 * partial failures don't leave a half-marked season.
 */

const BulkProgressBodySchema = z
  .object({
    parentId: z.string().min(1),
    scope: z.enum(['season', 'show']),
    seasonNumber: z.number().int().min(0).optional(),
    status: z.nativeEnum(WatchStatus),
  })
  .refine(
    (v) => !(v.scope === 'season' && v.seasonNumber === undefined),
    {
      message: '`seasonNumber` is required when scope === "season"',
      path: ['seasonNumber'],
    },
  )

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
      { event: 'progress.bulk.bad_request', reason: 'invalid_json' },
      'bulk progress body was not valid JSON',
    )
    return jsonResponse({ error: 'invalid_body', reason: 'invalid_json' }, 400)
  }

  const parsed = BulkProgressBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    logger.warn(
      { event: 'progress.bulk.bad_request', issues: parsed.error.issues },
      'bulk progress body validation failed',
    )
    return jsonResponse(
      { error: 'invalid_body', issues: parsed.error.issues },
      400,
    )
  }

  const { parentId, scope, seasonNumber, status } = parsed.data

  const where: Prisma.MediaItemWhereInput = {
    parent_id: parentId,
    type: MediaType.TV_EPISODE,
    unaired: false,
  }
  if (scope === 'season') {
    where.season_number = seasonNumber
  }

  const episodes = await db.mediaItem.findMany({
    where,
    select: { id: true },
  })

  if (episodes.length === 0) {
    return jsonResponse({ updated: 0 }, 200)
  }

  // 30s timeout mirrors Story 7.2a's transaction discipline. The callback form
  // is required to pass options; the array form rejects `timeout`. Sequential
  // upserts inside the callback are acceptable for the realistic worst case
  // (Game of Thrones at 73 episodes) and stay simpler than a Promise.all.
  await db.$transaction(
    async (tx) => {
      for (const episode of episodes) {
        await tx.userEntry.upsert({
          where: { media_item_id: episode.id },
          create: { media_item_id: episode.id, status, progress: 0 },
          update: { status },
        })
      }
    },
    { timeout: 30_000 },
  )

  logger.info(
    {
      event: 'progress.bulk.ok',
      parentId,
      scope,
      seasonNumber: scope === 'season' ? seasonNumber : null,
      updated: episodes.length,
    },
    'bulk progress upserted',
  )

  return jsonResponse({ updated: episodes.length }, 200)
}

export const POST = withRequest<NextRequest, NextResponse>(handler)
