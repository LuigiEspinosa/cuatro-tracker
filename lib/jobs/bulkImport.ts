import type { Job } from 'bullmq'
import { MediaType, Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import {
  getDispatcher,
  type NormalisedShowWithEpisodes,
} from '@/lib/search/media-dispatcher'
import { getMediaByMalId } from '@/lib/api/anilist'
import { normaliseAnilistAnime } from '@/lib/normalise/anime'
import { normaliseAnilistManga } from '@/lib/normalise/manga'
import { RELEASE_DATE_SENTINEL } from '@/lib/normalise/release-date'
import { ImportFormatSchema, parseImport, type ImportRow } from '@/lib/import/formats'
import {
  toDispatch,
  toUserEntry,
  type ImportUserEntryPatch,
} from '@/lib/import/map-row'

export const BULK_IMPORT_QUEUE = 'bulkImport'

// Progress + terminal frames publish here; the SSE events route subscribes on a
// dedicated redis.duplicate() connection. The uploaded file lives under the
// FILE prefix (distinct key space) until the processor consumes and deletes it.
export const BULK_IMPORT_CHANNEL_PREFIX = 'bulkImport:'
export const BULK_IMPORT_FILE_PREFIX = 'bulkImport:file:'

// NFR21: AniList caps at 90 req/min. The adapter's withLimit is a concurrency
// gate only (comment at anilist.ts:11), so the interval throttle lives here: a
// >= 700ms gap before each AniList (MAL) request keeps a bulk import inside the
// budget.
const ANILIST_IMPORT_DELAY_MS = 700

export type BulkImportResult = {
  imported: number
  duplicates: number
  failed: number
  total: number
}

const BulkImportDataSchema = z.object({
  format: ImportFormatSchema,
  redisKey: z.string().min(1),
})

// * target: ES2017 forbids top-level await in worker-imported modules; a plain
// * setTimeout-backed sleep is the throttle primitive.
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function rowTitle(row: ImportRow): string {
  if (row.format === 'STEAM_EXPORT') return row.name
  return row.title ?? ''
}

// Steam's 0 / null "never played" sentinel collapses to null; mirrors
// computeLastPlayed in lib/normalise/game.ts (private there, so replicated).
function steamLastPlayed(rtime: number | null): Date | null {
  if (rtime === null || !Number.isFinite(rtime) || rtime <= 0) return null
  const candidate = new Date(rtime * 1000)
  return Number.isNaN(candidate.getTime()) ? null : candidate
}

type CreateOutcome = 'imported' | 'duplicate'

async function createNormalised(
  normalised: Prisma.MediaItemCreateInput | NormalisedShowWithEpisodes,
  patch: ImportUserEntryPatch,
): Promise<void> {
  if ('episodes' in normalised) {
    await db.$transaction(
      async (tx) => {
        const show = await tx.mediaItem.create({
          data: { ...normalised.show, user_entry: { create: patch } },
          select: { id: true },
        })
        if (normalised.episodes.length > 0) {
          await tx.mediaItem.createMany({
            data: normalised.episodes.map((e) => ({
              ...(e as Prisma.MediaItemCreateManyInput),
              parent_id: show.id,
            })),
          })
        }
      },
      { timeout: 30_000 },
    )
    return
  }
  await db.mediaItem.create({
    data: { ...normalised, user_entry: { create: patch } },
  })
}

// Ensure a MediaItem that already carries this source id has a UserEntry; the
// import applies its status/progress/rating patch only when creating the entry,
// so a re-upload (or an app-added item) is an idempotent no-op on the entry.
async function ensureEntry(
  mediaItemId: string,
  patch: ImportUserEntryPatch,
): Promise<void> {
  const existing = await db.userEntry.findUnique({
    where: { media_item_id: mediaItemId },
    select: { id: true },
  })
  if (existing) return
  try {
    await db.userEntry.create({ data: { media_item_id: mediaItemId, ...patch } })
  } catch (err) {
    // Lost a race for UserEntry.media_item_id @unique: treat as present.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return
    }
    throw err
  }
}

async function importRow(row: ImportRow): Promise<CreateOutcome> {
  const dispatch = toDispatch(row)
  const patch = toUserEntry(row)

  try {
    if (dispatch.source === 'steam') {
      const existing = await db.mediaItem.findUnique({
        where: { steam_app_id: dispatch.sourceId },
        select: { id: true },
      })
      if (existing) {
        await ensureEntry(existing.id, patch)
        return 'duplicate'
      }
      const playtime =
        row.format === 'STEAM_EXPORT' && row.playtimeForever >= 0
          ? row.playtimeForever
          : null
      await db.mediaItem.create({
        data: {
          type: MediaType.GAME,
          title: rowTitle(row),
          release_date: new Date(RELEASE_DATE_SENTINEL),
          steam_app_id: dispatch.sourceId,
          playtime_minutes: playtime,
          last_played:
            row.format === 'STEAM_EXPORT'
              ? steamLastPlayed(row.rtimeLastPlayed)
              : null,
          user_entry: { create: patch },
        },
      })
      return 'imported'
    }

    if (dispatch.source === 'tmdb') {
      const existing = await db.mediaItem.findUnique({
        where: { tmdb_id: dispatch.sourceId },
        select: { id: true },
      })
      if (existing) {
        await ensureEntry(existing.id, patch)
        return 'duplicate'
      }
      const dispatcher = getDispatcher('tmdb', dispatch.type)
      if (!dispatcher) throw new Error(`no tmdb dispatcher for ${dispatch.type}`)
      const raw = await dispatcher.fetch(dispatch.sourceId)
      await createNormalised(dispatcher.normalise(raw), patch)
      return 'imported'
    }

    // anilist-mal: MAL ids have no MediaItem column, so the AniList fetch must
    // run first to learn the canonical anilist_id before the existence check.
    // The 700ms throttle precedes that request (AC-3.4).
    await sleep(ANILIST_IMPORT_DELAY_MS)
    const media =
      dispatch.type === MediaType.ANIME
        ? await getMediaByMalId(dispatch.sourceId, 'ANIME')
        : await getMediaByMalId(dispatch.sourceId, 'MANGA')
    const existing = await db.mediaItem.findUnique({
      where: { anilist_id: media.id },
      select: { id: true },
    })
    if (existing) {
      await ensureEntry(existing.id, patch)
      return 'duplicate'
    }
    const normalised =
      dispatch.type === MediaType.ANIME
        ? normaliseAnilistAnime(media)
        : normaliseAnilistManga(media)
    await createNormalised(normalised, patch)
    return 'imported'
  } catch (err) {
    // A unique-source-id collision means the row already exists (concurrent
    // create or a retry): count it as a duplicate, not a failure.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return 'duplicate'
    }
    throw err
  }
}

export async function bulkImportProcessor(job: Job): Promise<BulkImportResult> {
  const { format, redisKey } = BulkImportDataSchema.parse(job.data)
  const jobId = job.id ?? 'unknown'
  const channel = `${BULK_IMPORT_CHANNEL_PREFIX}${jobId}`

  try {
    const text = await redis.get(redisKey)
    if (text === null) {
      throw new Error('import file expired or missing from Redis')
    }

    const rows = parseImport(format, text)
    const result: BulkImportResult = {
      imported: 0,
      duplicates: 0,
      failed: 0,
      total: rows.length,
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      const currentTitle = rowTitle(row)
      try {
        const outcome = await importRow(row)
        if (outcome === 'duplicate') result.duplicates += 1
        else result.imported += 1
      } catch (err) {
        result.failed += 1
        logger.error(
          {
            event: 'job.import.row_failed',
            queue: BULK_IMPORT_QUEUE,
            jobId,
            format,
            title: currentTitle,
            err,
          },
          'bulk import: row failed',
        )
      }
      await redis.publish(
        channel,
        JSON.stringify({
          processed: i + 1,
          total: result.total,
          current_title: currentTitle,
        }),
      )
    }

    // Delete the source bytes only after the loop finishes. Deleting before
    // processing would make a BullMQ stalled-job re-run hard-fail on the missing
    // key; keeping the file until success lets a re-run re-read and resume (the
    // upserts are idempotent). The upload route's TTL backstops a hard crash.
    await redis.del(redisKey)

    await redis.publish(
      channel,
      JSON.stringify({ phase: 'complete', ...result }),
    )
    logger.info(
      { event: 'job.import.complete', queue: BULK_IMPORT_QUEUE, jobId, ...result },
      'bulk import complete',
    )
    return result
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'import failed'
    await redis.publish(channel, JSON.stringify({ phase: 'error', reason }))
    logger.error(
      { event: 'job.import.failed', queue: BULK_IMPORT_QUEUE, jobId, err },
      'bulk import failed',
    )
    throw err
  }
}
