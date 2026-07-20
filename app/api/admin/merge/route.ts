import { NextResponse, type NextRequest } from 'next/server'
import { Prisma, WatchStatus } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRequest } from '@/lib/request-context'

export const dynamic = 'force-dynamic'

/* `POST /api/admin/merge` (Story 11.4 AC-5): accept a MergeSuggestion.
 *
 * Re-points the source (duplicate) MediaItem's user data onto the target
 * (canonical) MediaItem, then deletes the source. Gated by the auth middleware
 * (the matcher does not exclude /api/admin), so an unauthenticated caller is
 * redirected to /login before reaching this handler.
 *
 * * Failure mode: the whole re-point + delete runs in one db.$transaction so a
 *   crash mid-way can never leave a UserEntry orphaned onto a deleted MediaItem
 *   or a half-merged pair.
 * * Roads not taken: returning the full next suggestion (OI #5). The client owns
 *   the pending list for Prev / Next, so the response carries only the resolved
 *   id plus the next id (or null), and the client advances locally.
 */

const MergeBodySchema = z.object({
  suggestionId: z.string().min(1),
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
})

// OI #3: the more-advanced WatchStatus wins when both entries exist. Rank order
// PLAN_TO_WATCH < ON_HOLD < DROPPED < WATCHING < COMPLETED, so a completed watch
// on either side is never demoted by the merge.
const STATUS_RANK: Record<WatchStatus, number> = {
  [WatchStatus.PLAN_TO_WATCH]: 0,
  [WatchStatus.ON_HOLD]: 1,
  [WatchStatus.DROPPED]: 2,
  [WatchStatus.WATCHING]: 3,
  [WatchStatus.COMPLETED]: 4,
}

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
      { event: 'admin.merge.bad_request', reason: 'invalid_json' },
      'merge body was not valid JSON',
    )
    return jsonResponse({ error: 'invalid_body', reason: 'invalid_json' }, 400)
  }

  const parsed = MergeBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    logger.warn(
      { event: 'admin.merge.bad_request', issues: parsed.error.issues },
      'merge body validation failed',
    )
    return jsonResponse(
      { error: 'invalid_body', issues: parsed.error.issues },
      400,
    )
  }

  const { suggestionId, sourceId, targetId } = parsed.data

  const suggestion = await db.mergeSuggestion.findUnique({
    where: { id: suggestionId },
  })
  if (!suggestion || suggestion.resolved) {
    logger.warn(
      { event: 'admin.merge.not_found', suggestionId },
      'merge suggestion missing or already resolved',
    )
    return jsonResponse({ error: 'not_found' }, 404)
  }

  // The body's ids must match the stored pair. A mismatch means the client is
  // acting on a stale suggestion (the roles changed under it); refuse rather
  // than delete the wrong MediaItem.
  if (suggestion.source_id !== sourceId || suggestion.target_id !== targetId) {
    logger.warn(
      {
        event: 'admin.merge.mismatch',
        suggestionId,
        bodySourceId: sourceId,
        bodyTargetId: targetId,
        rowSourceId: suggestion.source_id,
        rowTargetId: suggestion.target_id,
      },
      'merge body ids do not match the suggestion row',
    )
    return jsonResponse({ error: 'mismatch' }, 409)
  }

  try {
    await db.$transaction(
      async (tx) => {
        // Step 1 (AC-5.1): reconcile the source's UserEntry onto the target.
        // Must run BEFORE the source delete: UserEntry.media_item is
        // onDelete: Cascade, so deleting the source MediaItem first would take
        // the source's UserEntry (and its progress) down with it.
        const sourceEntry = await tx.userEntry.findUnique({
          where: { media_item_id: sourceId },
        })
        if (sourceEntry) {
          const targetEntry = await tx.userEntry.findUnique({
            where: { media_item_id: targetId },
          })
          if (!targetEntry) {
            // Target has no entry: a plain re-point is enough. media_item_id is
            // @unique and the target slot is free, so this cannot trip P2002.
            await tx.userEntry.update({
              where: { id: sourceEntry.id },
              data: { media_item_id: targetId },
            })
            logger.info(
              { event: 'admin.merge.entry.repointed', suggestionId, sourceId, targetId },
              'source UserEntry re-pointed onto the target',
            )
          } else {
            // Both sides have an entry: merge fields into the target, keeping the
            // more-advanced progress and status and preferring the target's
            // non-null timestamps / rating / notes (OI #3), then delete the
            // source entry so the source MediaItem delete has nothing to cascade.
            await tx.userEntry.update({
              where: { id: targetEntry.id },
              data: {
                progress: Math.max(targetEntry.progress, sourceEntry.progress),
                volume_progress: Math.max(
                  targetEntry.volume_progress,
                  sourceEntry.volume_progress,
                ),
                status:
                  STATUS_RANK[sourceEntry.status] > STATUS_RANK[targetEntry.status]
                    ? sourceEntry.status
                    : targetEntry.status,
                user_rating: targetEntry.user_rating ?? sourceEntry.user_rating,
                completed_at: targetEntry.completed_at ?? sourceEntry.completed_at,
                started_at: targetEntry.started_at ?? sourceEntry.started_at,
                notes: targetEntry.notes ?? sourceEntry.notes,
              },
            })
            await tx.userEntry.delete({ where: { id: sourceEntry.id } })
            logger.info(
              {
                event: 'admin.merge.entry.conflict_merged',
                suggestionId,
                sourceId,
                targetId,
              },
              'both entries existed; merged into target and deleted source entry',
            )
          }
        }

        // Step 2 (AC-5.2): re-point the source's children (TV episodes, manga
        // chapters) onto the target. updateMany only rewrites parent_id, which
        // carries no unique constraint, so it cannot trip P2002.
        // TODO: OI #4 - if a source child and a target child ever shared an
        // upstream tmdb_id (@unique on MediaItem), a future dedup pass would
        // need to drop the colliding source child. The canonical (movie-level)
        // flow has no children, so this is out of the guaranteed path today.
        await tx.mediaItem.updateMany({
          where: { parent_id: sourceId },
          data: { parent_id: targetId },
        })

        // Step 3 (AC-5.4): stamp the suggestion resolved. Ordered before the
        // source delete because MergeSuggestion.source is onDelete: Cascade, so
        // deleting the source MediaItem next removes this row (and any sibling
        // suggestion referencing the same duplicate) automatically. The stamp
        // still runs so the audit intent holds for the window it lives.
        await tx.mergeSuggestion.update({
          where: { id: suggestionId },
          data: { resolved: true, resolved_at: new Date() },
        })

        // Step 4 (AC-5.3): delete the source MediaItem. Cascades the resolved
        // suggestion row away per the note above.
        await tx.mediaItem.delete({ where: { id: sourceId } })
      },
      { timeout: 30_000 },
    )
  } catch (err) {
    logger.error(
      { event: 'admin.merge.tx_failed', suggestionId, err },
      'merge transaction failed',
    )
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return jsonResponse({ error: 'merge_failed', code: err.code }, 500)
    }
    return jsonResponse({ error: 'merge_failed' }, 500)
  }

  const next = await db.mergeSuggestion.findFirst({
    where: { resolved: false },
    orderBy: { confidence: 'desc' },
    select: { id: true },
  })

  logger.info(
    { event: 'admin.merge.ok', suggestionId, sourceId, targetId, next: next?.id ?? null },
    'merge suggestion accepted',
  )

  return jsonResponse({ resolvedId: suggestionId, next: next?.id ?? null }, 200)
}

export const POST = withRequest<NextRequest, NextResponse>(handler)
