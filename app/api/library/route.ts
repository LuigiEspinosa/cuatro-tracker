import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { type MediaItem, MediaType, type Prisma, type UserEntry, WatchStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { withRequest } from '@/lib/request-context'
import type { LibraryItem, LibraryListResponse } from '@/lib/types/library'

export const dynamic = 'force-dynamic'

/* `/api/library`: generic library filter endpoint. Returns the user's UserEntry
 * rows joined with MediaItem, scoped by optional query params.
 *
 * Story 5.3 initial shape: status / order / limit. Story 5.4 extends with
 * released_within_days + source / source_ids for the inLibrary chip flip in
 * GlobalSearch. Epic 6 will reuse this for the library grid.
 *
 * Single-user app: middleware (per Story 1.10) gates auth; UserEntry rows are
 * unscoped (one user; no userId column on UserEntry).
 */

const LibraryQuerySchema = z.object({
  status: z.nativeEnum(WatchStatus).optional(),
  order: z
    .enum(['updated_at_desc', 'created_at_desc', 'release_date_desc'])
    .optional()
    .default('updated_at_desc'),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  released_within_days: z.coerce.number().int().positive().max(3650).optional(),
})

type UserEntryWithMedia = UserEntry & { media_item: MediaItem }

function deriveYear(mediaItem: MediaItem): number | null {
  // 1970 is the normaliser's sentinel for "release date unknown" per
  // lib/normalise-movie.ts. Treat it as null at the API boundary.
  const year = mediaItem.release_date.getUTCFullYear()
  return year === 1970 ? null : year
}

function deriveReleaseDate(mediaItem: MediaItem): string | null {
  const year = mediaItem.release_date.getUTCFullYear()
  return year === 1970 ? null : mediaItem.release_date.toISOString()
}

function formatProgressLabel(
  mediaType: MediaType,
  status: WatchStatus,
  progress: number,
): string | null {
  if (mediaType === MediaType.MOVIE) {
    if (status === WatchStatus.COMPLETED) return 'WATCHED'
    if (status === WatchStatus.WATCHING && progress > 0 && progress < 100) {
      return `${progress}% WATCHED`
    }
    return status.replaceAll('_', ' ')
  }
  // TV / anime / manga / games progress formatting lands in Stories 7-9 when
  // those media types become addable. For now return null and let the client
  // hide the line.
  return null
}

function formatProgressPct(
  mediaType: MediaType,
  status: WatchStatus,
  progress: number,
): number | null {
  if (mediaType === MediaType.MOVIE) {
    if (status === WatchStatus.COMPLETED) return 100
    if (status === WatchStatus.WATCHING) return Math.min(100, Math.max(0, progress))
    return null
  }
  return null
}

function deriveSourceLabel(mediaItem: MediaItem): string | null {
  if (mediaItem.tmdb_id !== null) return 'From TMDB'
  if (mediaItem.anilist_id !== null) return 'From AniList'
  if (mediaItem.igdb_id !== null) return 'From IGDB'
  if (mediaItem.steam_id !== null) return 'From Steam'
  return null
}

function serializeLibraryItem(entry: UserEntryWithMedia): LibraryItem {
  const mediaItem = entry.media_item
  return {
    id: entry.id,
    mediaItemId: mediaItem.id,
    mediaType: mediaItem.type,
    status: entry.status,
    title: mediaItem.title,
    posterPath: mediaItem.poster_path,
    year: deriveYear(mediaItem),
    releaseDate: deriveReleaseDate(mediaItem),
    progressLabel: formatProgressLabel(mediaItem.type, entry.status, entry.progress),
    progressPct: formatProgressPct(mediaItem.type, entry.status, entry.progress),
    sourceLabel: deriveSourceLabel(mediaItem),
    createdAt: entry.created_at.toISOString(),
    updatedAt: entry.updated_at.toISOString(),
  }
}

async function handler(req: NextRequest): Promise<NextResponse> {
  const params = Object.fromEntries(req.nextUrl.searchParams)
  const parsed = LibraryQuerySchema.safeParse(params)
  if (!parsed.success) {
    logger.warn(
      { event: 'library.bad_request', issues: parsed.error.issues },
      'library query validation failed',
    )
    return NextResponse.json(
      { error: 'invalid_query', issues: parsed.error.issues },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    )
  }

  const { status, order, limit, released_within_days } = parsed.data

  // `released_within_days` filters by joined MediaItem.release_date and forces
  // ordering by release_date DESC regardless of the `order` param. This matches
  // the dashboard's "Recently Released" band semantics (Story 5.4 AC-5).
  const effectiveOrder = released_within_days !== undefined ? 'release_date_desc' : order

  const where: Prisma.UserEntryWhereInput = {}
  if (status) where.status = status
  if (released_within_days !== undefined) {
    // AC-5 reads "released in the last 30 days" — past-tense. The lower bound
    // (gte: floor) drops anything older than the window; the upper bound
    // (lte: now) drops future-dated releases (TMDB returns unreleased movies
    // with future release_date, and they should NOT surface as "recently
    // released"). 1970 sentinel rows for "unknown release date" are naturally
    // excluded by the floor (UNIX epoch < NOW - any positive N days).
    const now = new Date()
    const floor = new Date(now.getTime() - released_within_days * 24 * 60 * 60 * 1000)
    where.media_item = { release_date: { gte: floor, lte: now } }
  }

  const orderBy =
    effectiveOrder === 'release_date_desc'
      ? { media_item: { release_date: 'desc' as const } }
      : effectiveOrder === 'created_at_desc'
        ? { created_at: 'desc' as const }
        : { updated_at: 'desc' as const }

  const entries = await db.userEntry.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: { media_item: true },
    orderBy,
    take: limit,
  })

  const items = entries.map(serializeLibraryItem)
  const body: LibraryListResponse = { items }

  return NextResponse.json(body, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export const GET = withRequest<NextRequest, NextResponse>(handler)
