import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { type MediaItem, MediaType, WatchStatus } from '@prisma/client'
import {
  findLibraryItems,
  formatTvProgressLabel,
  formatTvProgressPct,
  type LibrarySortKey,
  type LifecycleStatus,
  type UserEntryWithMedia,
} from '@/lib/db/library'
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

// Schema accepts the public param names callers pass on the wire.
// `order` is the legacy 5.3/5.4 param (kept for backward compat with dashboard
// callers); `sort` is the 6.3 param using the LibrarySortKey union. When both
// are absent the default is `recently_added`. When both are present, `sort`
// wins so 6.3+ callers do not need to know about the legacy enum.
const LibraryQuerySchema = z
  .object({
    type: z.nativeEnum(MediaType).optional(),
    status: z.nativeEnum(WatchStatus).optional(),
    search: z.string().min(1).max(100).optional(),
    order: z
      .enum(['updated_at_desc', 'created_at_desc', 'release_date_desc'])
      .optional(),
    sort: z
      .enum([
        'recently_added',
        'recently_created',
        'release_date_desc',
        'title_asc',
        'status_asc',
        'rating_desc',
      ])
      .optional(),
    limit: z.coerce.number().int().positive().max(200).optional().default(20),
    released_within_days: z.coerce.number().int().positive().max(3650).optional(),
    lifecycle: z.enum(['in_progress', 'continuing', 'ended']).optional(),
  })
  // The `in_progress` lifecycle filter is a single-click composite for
  // WATCHING + lifecycle_status='continuing'. Allowing an explicit `status`
  // alongside it would silently override the composite, which is surprising.
  // Reject the combination so the API surface honours the override.
  .refine(
    (v) => !(v.status !== undefined && v.lifecycle === 'in_progress'),
    {
      message: '`status` cannot be combined with `lifecycle=in_progress` (the composite already pins status to WATCHING)',
      path: ['lifecycle'],
    },
  )

function resolveSort(
  sort: LibrarySortKey | undefined,
  order: 'updated_at_desc' | 'created_at_desc' | 'release_date_desc' | undefined,
): LibrarySortKey {
  if (sort) return sort
  if (order === 'created_at_desc') return 'recently_created'
  if (order === 'release_date_desc') return 'release_date_desc'
  return 'recently_added'
}

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
  entry: UserEntryWithMedia,
): string | null {
  const { type } = entry.media_item
  const { status, progress } = entry
  if (type === MediaType.MOVIE) {
    if (status === WatchStatus.COMPLETED) return 'WATCHED'
    if (status === WatchStatus.WATCHING && progress > 0 && progress < 100) {
      return `${progress}% WATCHED`
    }
    return status.replaceAll('_', ' ')
  }
  if (type === MediaType.TV_SHOW) {
    return formatTvProgressLabel(status, entry.episodeStats)
  }
  // anime / manga / games progress formatting lands in Stories 8-9.
  return null
}

function formatProgressPct(
  entry: UserEntryWithMedia,
): number | null {
  const { type } = entry.media_item
  const { status, progress } = entry
  if (type === MediaType.MOVIE) {
    if (status === WatchStatus.COMPLETED) return 100
    if (status === WatchStatus.WATCHING) return Math.min(100, Math.max(0, progress))
    return null
  }
  if (type === MediaType.TV_SHOW) {
    return formatTvProgressPct(entry.episodeStats)
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
    progressLabel: formatProgressLabel(entry),
    progressPct: formatProgressPct(entry),
    sourceLabel: deriveSourceLabel(mediaItem),
    tmdbId: mediaItem.tmdb_id,
    anilistId: mediaItem.anilist_id,
    igdbId: mediaItem.igdb_id,
    steamId: mediaItem.steam_id,
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

  const { type, status, search, order, sort, limit, released_within_days, lifecycle } = parsed.data

  const lifecycleStatus: LifecycleStatus | undefined =
    lifecycle === 'continuing' || lifecycle === 'ended' ? lifecycle : undefined
  const lifecycleInProgress = lifecycle === 'in_progress'

  const entries = await findLibraryItems({
    mediaType: type,
    status,
    search,
    sort: resolveSort(sort, order),
    limit,
    releasedWithinDays: released_within_days,
    lifecycleStatus,
    lifecycleInProgress,
  })

  const items = entries.map(serializeLibraryItem)
  const body: LibraryListResponse = { items }

  return NextResponse.json(body, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export const GET = withRequest<NextRequest, NextResponse>(handler)
