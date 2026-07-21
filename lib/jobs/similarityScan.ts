import type { Job } from 'bullmq'
import { MediaType, Prisma, type MediaItem } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { computeSimilarity, MERGE_SIMILARITY_THRESHOLD } from '@/lib/merge'
import { isReleaseDateUnknown } from '@/lib/normalise/release-date'

export const SIMILARITY_SCAN_QUEUE = 'similarityScan'

// Enqueued on demand by the bulk import job (after a successful run) and by the
// accept-merge route (against the surviving canonical item), never scheduled.
//
// * Failure mode: namedRole is what stops the two callers meaning opposite
// * things by the same payload. The import caller's ids are freshly imported
// * duplicates, which belong on the source side because accepting a suggestion
// * DELETES the source. The merge caller's single id is the canonical SURVIVOR,
// * so it has to land on the target side; naming it source would mean accepting
// * the resurfaced pair deletes the row the previous merge just chose to keep.
const SimilarityScanDataSchema = z.object({
  mediaItemIds: z.array(z.string().min(1)).min(1),
  namedRole: z.enum(['source', 'target']).default('source'),
})

// Which side of a created MergeSuggestion the named mediaItemIds take.
export type ScanRole = 'source' | 'target'

// Prisma codes that mean "this pair lost a race", not "the database is broken":
// a duplicate on the pair unique index, a foreign key whose row was deleted
// after the candidate load, and a suggestion the cascade removed between the
// lookup and the update. Each leaves the pair unwritten and the batch healthy.
const PAIR_RACE_CODES = new Set(['P2002', 'P2003', 'P2025'])

// Structurally a MergeCandidate plus the id, so it feeds computeSimilarity
// directly without a projection step.
export type ScanCandidate = Pick<
  MediaItem,
  'id' | 'title' | 'release_date' | 'type'
>

export type ScanPair = {
  sourceId: string
  targetId: string
  confidence: number
}

// `skipped` means exactly one thing: a qualifying pair that produced no write.
// That covers a pair already dismissed or resolved, and a pair that lost one of
// the PAIR_RACE_CODES races. Rows the scan could not score at all are neither
// pairs nor skips; they surface as `excluded` on the completion log line.
export type SimilarityScanResult = {
  scanned: number
  pairs: number
  created: number
  updated: number
  skipped: number
}

const SCAN_SELECT = {
  id: true,
  title: true,
  release_date: true,
  type: true,
} as const

// * Two exclusions, both of which would otherwise flood the merge tool:
// * 1. TV_EPISODE. Episode titles are generic, so two "Pilot" rows from
// *    different shows in the same year score a perfect 1.0. Episode duplicates
// *    also have no user-facing fix: /admin/merge reviews top-level items, and
// *    accepting a parent merge already re-points children.
// * 2. An unknown release date. Every Steam-export row is stored with the 1970
// *    sentinel, and yearProximity(sentinel, sentinel) is 1.0, so any two
// *    imported Steam games score 0.6 * titleSimilarity + 0.4 and clear the
// *    threshold on title similarity alone (0.75 is enough, which Jaro-Winkler
// *    hands out to any pair sharing a prefix). Meanwhile the pair that SHOULD
// *    match, an undated Steam row against a dated IGDB row for the same game,
// *    scores 0.7 and is missed anyway.
// * Roads not taken: a sentinel-aware year axis inside computeSimilarity, which
// * would score undated pairs on title and type alone. It is the truer metric
// * but it changes a shipped scoring function every other consumer reads.
// * Long-term cost: a pure Steam import yields zero suggestions. Acceptable
// * today because Steam rows already dedup on steam_app_id, and it resolves once
// * imported Steam rows are enriched with real IGDB release dates and rescanned.
function isScannable(item: ScanCandidate): boolean {
  return (
    item.type !== MediaType.TV_EPISODE && !isReleaseDateUnknown(item.release_date)
  )
}

// Canonical key for an unordered pair, so a new-vs-new pair (both sides appear
// in newItems AND in candidates) is emitted once rather than once per direction.
function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

/* Pure pair selection: no DB, no Redis, no clock.
 *
 * * Failure mode: this is O(N x M) with the entire candidate set held in memory.
 * *  At personal-library scale (a few thousand rows, an import of a few hundred)
 * *  that is a sub-second in-process loop.
 * * Long-term cost: past roughly 50k rows the candidate load itself becomes the
 * *  problem, not the comparison loop. The fix then is a blocking key (first
 * *  normalised token plus release year) so each new item only compares against
 * *  its own bucket, which is a change to this function alone.
 *
 * namedRole is required rather than defaulted: the two callers want opposite
 * orientations, and a default silently gives one of them the wrong one.
 */
export function findScanPairs(
  newItems: ScanCandidate[],
  candidates: ScanCandidate[],
  namedRole: ScanRole,
): ScanPair[] {
  const pairs: ScanPair[] = []
  const emitted = new Set<string>()

  for (const item of newItems) {
    if (!isScannable(item)) continue
    for (const candidate of candidates) {
      if (candidate.id === item.id) continue
      if (!isScannable(candidate)) continue
      const key = pairKey(item.id, candidate.id)
      if (emitted.has(key)) continue
      const confidence = computeSimilarity(item, candidate)
      if (confidence < MERGE_SIMILARITY_THRESHOLD) continue
      emitted.add(key)
      pairs.push(
        namedRole === 'source'
          ? { sourceId: item.id, targetId: candidate.id, confidence }
          : { sourceId: candidate.id, targetId: item.id, confidence },
      )
    }
  }

  return pairs
}

export async function similarityScanProcessor(
  job: Job,
): Promise<SimilarityScanResult> {
  const { mediaItemIds, namedRole } = SimilarityScanDataSchema.parse(job.data)
  const jobId = job.id ?? 'unknown'
  const startedAt = Date.now()

  const newItems = await db.mediaItem.findMany({
    where: { id: { in: mediaItemIds } },
    select: SCAN_SELECT,
  })

  const result: SimilarityScanResult = {
    scanned: newItems.length,
    pairs: 0,
    created: 0,
    updated: 0,
    skipped: 0,
  }

  const scannable = newItems.filter(isScannable)
  const types = [...new Set(scannable.map((item) => item.type))]

  // One findMany for every type present in the batch, never one per item.
  const candidates =
    types.length === 0
      ? []
      : await db.mediaItem.findMany({
          where: { type: { in: types } },
          select: SCAN_SELECT,
        })

  const pairs = findScanPairs(newItems, candidates, namedRole)
  result.pairs = pairs.length

  // * Failure mode: the writes run one pair at a time rather than through a
  // *  Promise.all. Each pair needs its own read-then-write, and a whole
  // *  import's worth of them fanned out at once would exhaust the Prisma
  // *  connection pool. The job is deferred and unobserved, so latency costs
  // *  nothing here.
  for (const pair of pairs) {
    try {
      // Either orientation counts as "this pair is already known". The unique
      // index covers (source, target) only, so the mirrored row is exactly what
      // this lookup exists to catch.
      const existing = await db.mergeSuggestion.findFirst({
        where: {
          OR: [
            { source_id: pair.sourceId, target_id: pair.targetId },
            { source_id: pair.targetId, target_id: pair.sourceId },
          ],
        },
        select: { id: true, resolved: true, dismissed: true },
      })

      if (existing) {
        // A dismissed or accepted pair does not resurface while its row lives
        // (Story 11.4 AC-6). Note the limit of that guarantee: accepting a merge
        // deletes the source MediaItem, and both MergeSuggestion FKs cascade, so
        // a dismissal recorded against a deleted row is gone and a later rescan
        // can legitimately re-derive the pair. A durable dismissal ledger is the
        // fix, and it is logged as deferred work rather than solved here.
        // A still pending row gets a fresh confidence and keeps its roles:
        // flipping source and target under an open review would make the
        // client's in-flight accept fail the 409 stale-role guard.
        if (existing.resolved || existing.dismissed) {
          result.skipped += 1
          continue
        }
        await db.mergeSuggestion.update({
          where: { id: existing.id },
          data: { confidence: pair.confidence },
        })
        result.updated += 1
        continue
      }

      await db.mergeSuggestion.create({
        data: {
          source_id: pair.sourceId,
          target_id: pair.targetId,
          confidence: pair.confidence,
          resolved: false,
          dismissed: false,
        },
      })
      result.created += 1
    } catch (err) {
      // * Failure mode: one lost race must not discard the rest of the batch.
      // *  The sibling bulk import settled the same question for its row loop.
      // *  Only the known race codes are absorbed; anything else (a dead
      // *  connection, a constraint this code does not know about) still throws
      // *  so BullMQ can fail and retry the job rather than report a clean run
      // *  over a broken database.
      if (
        !(err instanceof Prisma.PrismaClientKnownRequestError) ||
        !PAIR_RACE_CODES.has(err.code)
      ) {
        throw err
      }
      result.skipped += 1
      logger.warn(
        {
          event: 'job.scan.pair_skipped',
          queue: SIMILARITY_SCAN_QUEUE,
          jobId,
          sourceId: pair.sourceId,
          targetId: pair.targetId,
          code: err.code,
        },
        'similarity scan pair lost a write race',
      )
    }
  }

  logger.info(
    {
      event: 'job.scan.complete',
      queue: SIMILARITY_SCAN_QUEUE,
      jobId,
      ...result,
      excluded: newItems.length - scannable.length,
      candidates: candidates.length,
      durationMs: Date.now() - startedAt,
    },
    'similarity scan complete',
  )

  return result
}
