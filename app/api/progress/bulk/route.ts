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

  // ECH-T20: completed_at is a server-side invariant of the COMPLETED status.
  // This route never accepts completed_at from the client, so the invariant is
  // enforced here: any non-COMPLETED target clears it, and a COMPLETED mark
  // stamps one shared batch timestamp ONLY where no completion timestamp exists
  // yet. Episodes completed individually keep their original watch dates
  // (mirrors the single route's entry.completed_at === null guard), so an
  // idempotent re-mark never rewrites consumed-timeline history.
  const completedAt = status === WatchStatus.COMPLETED ? new Date() : null

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

  // Existing completion timestamps, read up front so the upsert loop can
  // preserve them on a COMPLETED re-mark. Skipped entirely for non-COMPLETED
  // targets, which always clear.
  const existingCompletedAt =
    status === WatchStatus.COMPLETED
      ? new Map(
          (
            await db.userEntry.findMany({
              where: { media_item_id: { in: episodes.map((e) => e.id) } },
              select: { media_item_id: true, completed_at: true },
            })
          ).map((entry) => [entry.media_item_id, entry.completed_at]),
        )
      : new Map<string, Date | null>()

  // 30s timeout mirrors Story 7.2a's transaction discipline. The callback form
  // is required to pass options; the array form rejects `timeout`. Sequential
  // upserts inside the callback are acceptable for the realistic worst case
  // (Game of Thrones at 73 episodes) and stay simpler than a Promise.all.
  await db.$transaction(
    async (tx) => {
      for (const episode of episodes) {
        const preservedCompletedAt =
          status === WatchStatus.COMPLETED
            ? (existingCompletedAt.get(episode.id) ?? completedAt)
            : null
        await tx.userEntry.upsert({
          where: { media_item_id: episode.id },
          create: {
            media_item_id: episode.id,
            status,
            progress: 0,
            completed_at: completedAt,
          },
          update: { status, completed_at: preservedCompletedAt },
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
