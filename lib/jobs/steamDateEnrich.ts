import type { Job } from 'bullmq'
import { MediaType } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { getGames, mapSteamAppIdsToIgdbGameIds } from '@/lib/api/igdb'
import { computeIgdbReleaseDate } from '@/lib/normalise/game'
import {
  RELEASE_DATE_SENTINEL,
  isReleaseDateUnknown,
} from '@/lib/normalise/release-date'
import { SIMILARITY_SCAN_QUEUE } from '@/lib/jobs/similarityScan'

export const STEAM_DATE_ENRICH_QUEUE = 'steamDateEnrich'

// mediaItemIds is optional: the bulk import names the rows it just created, and
// an empty payload is the manual backfill over every sentinel-dated Steam row
// already in the library.
// * Failure mode: the sentinel filter lives in the WHERE clause in BOTH modes,
// * never only in the caller. An id list can therefore never overwrite a row
// * that already carries a real date, whatever a caller passes.
// ! .min(1) matches SimilarityScanDataSchema and is load-bearing here. An empty
// ! array is truthy, so without it `{ mediaItemIds: [] }` spreads `id: { in: [] }`
// ! into the where clause, matches nothing, and returns a clean scanned: 0. That
// ! is the exact opposite of the documented empty-payload contract, on the one
// ! path (a hand-built backfill payload) most likely to produce it.
const SteamDateEnrichDataSchema = z.object({
  mediaItemIds: z.array(z.string().min(1)).min(1).optional(),
})

// `matched` counts rows that resolved to an IGDB game; `dated` counts the rows
// actually written. The two differ when IGDB knows the game but has no usable
// release date, which leaves the row at the sentinel and is a correct outcome
// rather than a failure. `unmatched` covers both "no Steam mapping at all" and
// the rarer "the appid mapped, but the games fetch did not return that id"; the
// second is an IGDB data-integrity problem rather than a routine miss, so it
// carries its own warn line and the two are told apart in the log, not in the
// totals. `failed` is "the row write itself threw".
export type SteamDateEnrichResult = {
  scanned: number
  matched: number
  dated: number
  unmatched: number
  failed: number
}

/* Enqueue the rescan for rows this job just dated.
 *
 * Structurally identical to enqueueSimilarityScan in lib/jobs/bulkImport.ts,
 * including both of its traps, which apply here unchanged:
 * ! the lazy import, because lib/jobs/queues.ts imports THIS module for its
 * ! processor and a top-level import back would close the cycle and resolve to
 * ! undefined at worker boot; and
 * ! the three colon-separated parts, because BullMQ rejects any custom job id
 * ! containing a colon unless it splits into exactly three.
 *
 * namedRole is 'source': the newly dated Steam row is the disposable side of
 * the pair and the pre-existing IGDB row carries the cover, genres and summary,
 * so the Steam row belongs where accepting deletes it. The Steam-only fields it
 * holds are carried onto the survivor by the accept route rather than lost.
 */
async function enqueueSimilarityScan(
  mediaItemIds: string[],
  enrichJobId: string,
): Promise<void> {
  if (mediaItemIds.length === 0) return
  try {
    const { queues } = await import('@/lib/jobs/queues')
    const entry = queues.find((q) => q.name === SIMILARITY_SCAN_QUEUE)
    if (!entry) throw new Error('similarityScan queue is not registered')
    // ! THIS job's own id is already a three-part colon id when the bulk import
    // ! enqueued it (steamDateEnrich:import:<importJobId>), so interpolating it
    // ! whole yields five parts and BullMQ throws "Custom Id cannot contain :".
    // ! The throw lands in the catch below and is only a warn, so the rescan
    // ! would never run and nothing would look broken. Flattening the colons
    // ! keeps the id deterministic (a retry still dedups) and loses nothing.
    const scanSuffix = enrichJobId.split(':').join('-')
    await entry.queue.add(
      'scan',
      { mediaItemIds, namedRole: 'source' },
      { jobId: `${SIMILARITY_SCAN_QUEUE}:enrich:${scanSuffix}` },
    )
    logger.info(
      {
        event: 'job.enrich.scan_enqueued',
        queue: STEAM_DATE_ENRICH_QUEUE,
        jobId: enrichJobId,
        mediaItems: mediaItemIds.length,
      },
      'similarity scan enqueued after date enrichment',
    )
  } catch (err) {
    logger.warn(
      {
        event: 'job.enrich.scan_enqueue_failed',
        queue: STEAM_DATE_ENRICH_QUEUE,
        jobId: enrichJobId,
        mediaItems: mediaItemIds.length,
        err,
      },
      'date enrichment committed but similarity scan enqueue failed',
    )
  }
}

export async function steamDateEnrichProcessor(
  job: Job,
): Promise<SteamDateEnrichResult> {
  const { mediaItemIds } = SteamDateEnrichDataSchema.parse(job.data)
  const jobId = job.id ?? 'unknown'
  const startedAt = Date.now()

  // gt: 0 mirrors steamAchievementSync: Steam never assigns appid 0, so a stray
  // 0 row would only ever burn a lookup.
  const rows = await db.mediaItem.findMany({
    where: {
      type: MediaType.GAME,
      steam_app_id: { not: null, gt: 0 },
      release_date: RELEASE_DATE_SENTINEL,
      ...(mediaItemIds ? { id: { in: mediaItemIds } } : {}),
    },
    select: { id: true, steam_app_id: true },
  })

  const result: SteamDateEnrichResult = {
    scanned: rows.length,
    matched: 0,
    dated: 0,
    unmatched: 0,
    failed: 0,
  }

  if (rows.length === 0) {
    logger.info(
      {
        event: 'job.enrich.complete',
        queue: STEAM_DATE_ENRICH_QUEUE,
        jobId,
        ...result,
        durationMs: Date.now() - startedAt,
      },
      'steam date enrichment complete',
    )
    return result
  }

  // * TypeScript narrowing only: Prisma types steam_app_id as number | null
  // * despite the { not: null } clause above.
  const appIds = rows
    .map((row) => row.steam_app_id)
    .filter((appId): appId is number => appId !== null)

  const gameIdByAppId = await mapSteamAppIdsToIgdbGameIds(appIds)
  const games = await getGames([...new Set(gameIdByAppId.values())])
  const gameById = new Map(games.map((game) => [game.id, game]))

  const datedIds: string[] = []

  for (const row of rows) {
    const gameId =
      row.steam_app_id === null ? undefined : gameIdByAppId.get(row.steam_app_id)
    const game = gameId === undefined ? undefined : gameById.get(gameId)
    if (!game) {
      result.unmatched += 1
      // The appid resolved but the game did not come back. Delisted, merged
      // away, or lost to the response limit: unlike a plain no-mapping this one
      // may well succeed on a later run, so it must not read as routine.
      if (gameId !== undefined) {
        logger.warn(
          {
            event: 'job.enrich.game_missing',
            queue: STEAM_DATE_ENRICH_QUEUE,
            jobId,
            mediaItemId: row.id,
            appId: row.steam_app_id,
            igdbGameId: gameId,
          },
          'steam appid mapped to an IGDB game the games fetch did not return',
        )
      }
      continue
    }
    result.matched += 1

    // computeIgdbReleaseDate falls back to the sentinel, so an IGDB game with
    // no usable date leaves the row exactly as it was.
    const releaseDate = computeIgdbReleaseDate(game)
    if (isReleaseDateUnknown(releaseDate)) continue

    try {
      // D5: release_date and nothing else. Writing igdb_id here would trip the
      // column's unique index for precisely the duplicate this job exists to
      // surface, and would make the Steam row look canonical.
      await db.mediaItem.update({
        where: { id: row.id },
        data: { release_date: releaseDate },
      })
      result.dated += 1
      datedIds.push(row.id)
    } catch (err) {
      result.failed += 1
      logger.error(
        {
          event: 'job.enrich.row_failed',
          queue: STEAM_DATE_ENRICH_QUEUE,
          jobId,
          mediaItemId: row.id,
          appId: row.steam_app_id,
          err,
        },
        'steam date enrichment: row failed',
      )
    }
  }

  logger.info(
    {
      event: 'job.enrich.complete',
      queue: STEAM_DATE_ENRICH_QUEUE,
      jobId,
      ...result,
      durationMs: Date.now() - startedAt,
    },
    'steam date enrichment complete',
  )

  await enqueueSimilarityScan(datedIds, jobId)

  return result
}
