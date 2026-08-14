import { NextResponse, type NextRequest } from 'next/server'
import { Prisma, WatchStatus } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRequest } from '@/lib/request-context'
import { queues } from '@/lib/jobs/queues'
import { SIMILARITY_SCAN_QUEUE } from '@/lib/jobs/similarityScan'

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

// Source-only columns that would otherwise die with the source row. The four
// source ids are each Int? @unique, and the Steam pair lives only on the row
// being deleted. achievement_sync_status rides along because it gates whether
// the game page renders an achievement list at all.
const CARRIED_SELECT = {
  steam_app_id: true,
  igdb_id: true,
  tmdb_id: true,
  anilist_id: true,
  playtime_minutes: true,
  last_played: true,
  achievement_sync_status: true,
} as const

// undefined means "leave the target alone", which is exactly how Prisma reads an
// omitted update field, so the target's own value always wins.
function carryIfNull<T>(targetValue: T | null, sourceValue: T | null) {
  return targetValue === null && sourceValue !== null ? sourceValue : undefined
}

// * Failure mode: playtime is a measurement, not an identity, and its "unset"
// * value is 0 rather than null. The bulk import writes playtime_forever
// * straight through, so a never-played Steam row lands at 0, and a null-only
// * fill would read that 0 as "already set" and silently discard the survivor's
// * real hours. Both rows describe the same game, so the larger number is the
// * true one. The five columns above stay null-only: they are identities, where
// * "the target already has one" is a real answer.
function carryHigher(targetValue: number | null, sourceValue: number | null) {
  if (sourceValue === null) return undefined
  return targetValue === null || sourceValue > targetValue
    ? sourceValue
    : undefined
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

        /* Step 2.5: carry the source's source-only data onto the survivor.
         *
         * * Failure mode: the ordering here is the whole correctness argument
         *   and cannot be reordered. Achievement.game is onDelete: Cascade, so
         *   the re-point has to happen BEFORE the delete or the cascade eats
         *   the rows; and steam_app_id / igdb_id / tmdb_id / anilist_id are
         *   each @unique, so the target fill has to happen AFTER it or the
         *   write collides with the source row that still holds those values.
         *   Without this step, accepting a Steam-vs-IGDB pair silently destroys
         *   the appid, the playtime, the last-played stamp and every synced
         *   achievement, with no warning and no undo.
         * * Failure mode: "the target has no achievements" is not on its own a
         *   licence to move them. The survivor keeps its OWN steam_app_id when
         *   it has one, so re-pointing into a row already linked to a different
         *   appid leaves it owning another game's achievements and colliding
         *   with its own next sync. Both conditions have to hold.
         * * Roads not taken: re-pointing achievements when the target already
         *   has some. Achievement carries @@unique([game_id, steam_api_name]),
         *   so a blind re-point would collide, and merging two real achievement
         *   sets is a data question this route cannot answer. In that case the
         *   source's achievements go down with the source row, which is the
         *   pre-existing behaviour, and the warn below is the only record of it.
         */
        const source = await tx.mediaItem.findUnique({
          where: { id: sourceId },
          select: CARRIED_SELECT,
        })
        const target = await tx.mediaItem.findUnique({
          where: { id: targetId },
          select: CARRIED_SELECT,
        })

        let movedAchievements = false
        if (source && target) {
          const keepsSourceAppId =
            target.steam_app_id === null ||
            target.steam_app_id === source.steam_app_id
          const targetAchievements = await tx.achievement.count({
            where: { game_id: targetId },
          })
          if (targetAchievements === 0 && keepsSourceAppId) {
            const moved = await tx.achievement.updateMany({
              where: { game_id: sourceId },
              data: { game_id: targetId },
            })
            movedAchievements = moved.count > 0
            if (moved.count > 0) {
              logger.info(
                {
                  event: 'admin.merge.achievements.repointed',
                  suggestionId,
                  sourceId,
                  targetId,
                  count: moved.count,
                },
                'source achievements re-pointed onto the target',
              )
            }
          } else {
            // The one branch that destroys data, so it is the one branch that
            // must leave a record. The cascade on the delete below is what
            // removes them.
            const dropped = await tx.achievement.count({
              where: { game_id: sourceId },
            })
            if (dropped > 0) {
              logger.warn(
                {
                  event: 'admin.merge.achievements.dropped',
                  suggestionId,
                  sourceId,
                  targetId,
                  count: dropped,
                  reason:
                    targetAchievements > 0
                      ? 'target_has_own'
                      : 'target_keeps_another_appid',
                },
                'source achievements dropped with the source row',
              )
            }
          }
        }

        // Step 3 (AC-5.3 + AC-5.4): delete the source MediaItem.
        // MergeSuggestion.source is onDelete: Cascade, so this removes the
        // accepted suggestion row (and any sibling suggestion referencing the
        // same duplicate) automatically. No explicit resolved / resolved_at
        // stamp: the row is cascade-removed a step later, so stamping it would
        // be dead work (there is no merge-history table for it to persist into).
        await tx.mediaItem.delete({ where: { id: sourceId } })

        // Step 4: fill the survivor's empty source-only columns, now that the
        // row holding those unique values is gone.
        if (source && target) {
          const carried = {
            steam_app_id: carryIfNull(target.steam_app_id, source.steam_app_id),
            igdb_id: carryIfNull(target.igdb_id, source.igdb_id),
            tmdb_id: carryIfNull(target.tmdb_id, source.tmdb_id),
            anilist_id: carryIfNull(target.anilist_id, source.anilist_id),
            playtime_minutes: carryHigher(
              target.playtime_minutes,
              source.playtime_minutes,
            ),
            last_played: carryIfNull(target.last_played, source.last_played),
            // Achievements that moved arrive with the source's sync state.
            // Without it the survivor keeps its own "never_synced" and the game
            // page renders the NOT YET SYNCED banner INSTEAD of the list, so the
            // rows are preserved in the database and invisible on screen until
            // the next six-hourly sync happens to flip the status.
            achievement_sync_status: movedAchievements
              ? source.achievement_sync_status
              : undefined,
          }
          if (Object.values(carried).some((value) => value !== undefined)) {
            await tx.mediaItem.update({
              where: { id: targetId },
              data: carried,
            })
            logger.info(
              {
                event: 'admin.merge.fields.carried',
                suggestionId,
                sourceId,
                targetId,
                fields: Object.entries(carried)
                  .filter(([, value]) => value !== undefined)
                  .map(([field]) => field),
              },
              'source-only fields carried onto the target',
            )
          }
        }
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

  // The merge has already committed. Computing the next pending id is a
  // convenience for the client (which owns its own queue), so a failure here
  // must not report the committed merge as failed: fall back to null.
  let nextId: string | null = null
  try {
    const next = await db.mergeSuggestion.findFirst({
      where: { resolved: false },
      orderBy: { confidence: 'desc' },
      select: { id: true },
    })
    nextId = next?.id ?? null
  } catch (err) {
    logger.warn(
      { event: 'admin.merge.next_lookup_failed', suggestionId, err },
      'merge committed but next-suggestion lookup failed',
    )
  }

  // Re-derive duplicates against the surviving item. Deleting the source
  // cascade-removed every OTHER pending suggestion that referenced it (both FKs
  // are onDelete: Cascade), so a still-valid C~source pair has to come back as
  // C~target or it is lost. Best-effort for the same reason as the lookup above:
  // the merge is already committed, so a queue failure must not report a 500.
  try {
    const entry = queues.find((q) => q.name === SIMILARITY_SCAN_QUEUE)
    if (!entry) throw new Error('similarityScan queue is not registered')
    // namedRole 'target': targetId is the SURVIVOR. Naming it source would put
    // it on the side accepting deletes, so re-deriving C~source as C~target
    // would instead propose destroying the row this merge just preserved.
    await entry.queue.add(
      'scan',
      { mediaItemIds: [targetId], namedRole: 'target' },
      { jobId: `${SIMILARITY_SCAN_QUEUE}:merge:${suggestionId}` },
    )
  } catch (err) {
    logger.warn(
      { event: 'admin.merge.scan_enqueue_failed', suggestionId, targetId, err },
      'merge committed but similarity scan enqueue failed',
    )
  }

  logger.info(
    { event: 'admin.merge.ok', suggestionId, sourceId, targetId, next: nextId },
    'merge suggestion accepted',
  )

  return jsonResponse({ resolvedId: suggestionId, next: nextId }, 200)
}

export const POST = withRequest<NextRequest, NextResponse>(handler)
