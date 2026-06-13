import { type MediaItem, type Prisma, type UserEntry, MediaType, WatchStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { getGameImageUrl } from '@/lib/api/igdb-images'
import {
  deriveDisplayDate,
  deriveDisplayYear,
  RELEASE_DATE_SENTINEL,
} from '@/lib/normalise/release-date'
import type { LibraryItem } from '@/lib/types/library'

export type LibrarySortKey =
  | 'recently_added'
  | 'recently_created'
  | 'release_date_desc'
  | 'title_asc'
  | 'status_asc'
  | 'rating_desc'

export type LifecycleStatus = 'continuing' | 'ended' | 'in_production'

export type LibraryQueryOptions = {
  mediaType?: MediaType
  status?: WatchStatus
  search?: string
  sort?: LibrarySortKey
  limit?: number
  releasedWithinDays?: number
  lifecycleStatus?: LifecycleStatus
  // Composite filter: status=WATCHING AND media_item.lifecycle_status='continuing'.
  // Mutually exclusive with lifecycleStatus; the caller passes one or the other.
  lifecycleInProgress?: boolean
}

export type EpisodeStats = {
  total: number
  watched: number
  latestS: number | null
  latestE: number | null
}

export type UserEntryWithMedia = UserEntry & {
  media_item: MediaItem
  episodeStats?: EpisodeStats
}

const DEFAULT_LIMIT = 200
const DEFAULT_SORT: LibrarySortKey = 'recently_added'

export async function findUserEntryByMediaItemId(
  mediaItemId: string,
): Promise<UserEntryWithMedia | null> {
  return db.userEntry.findUnique({
    where: { media_item_id: mediaItemId },
    include: { media_item: true },
  })
}

// Timeline dataset (Story 10.4): every UserEntry joined to its MediaItem, one
// row per work. Excludes TV_EPISODE (the parent show stands in for the series on
// the timeline) and undatable rows (release_date = RELEASE_DATE_SENTINEL, which
// also drops NULL release_dates via SQL three-valued logic). No take cap: the
// chronological timeline renders the whole in-scope library at once (the design
// anti-checklist forbids pagination). Ordered release_date desc to match the
// default sort; <TimelineView> re-sorts client-side per the active SortMode.
export async function findTimelineEntries(): Promise<UserEntryWithMedia[]> {
  return db.userEntry.findMany({
    where: {
      media_item: {
        type: { not: MediaType.TV_EPISODE },
        release_date: { not: RELEASE_DATE_SENTINEL },
      },
    },
    include: { media_item: true },
    orderBy: { media_item: { release_date: 'desc' } },
  })
}

export async function findLibraryItems(
  opts: LibraryQueryOptions = {},
): Promise<UserEntryWithMedia[]> {
  const {
    mediaType,
    status,
    search,
    sort = DEFAULT_SORT,
    limit = DEFAULT_LIMIT,
    releasedWithinDays,
    lifecycleStatus,
    lifecycleInProgress,
  } = opts

  const mediaWhere: Prisma.MediaItemWhereInput = {}
  if (mediaType) mediaWhere.type = mediaType
  if (search && search.trim().length > 0) {
    mediaWhere.title = { contains: search.trim(), mode: 'insensitive' }
  }
  if (releasedWithinDays !== undefined) {
    const now = new Date()
    const floor = new Date(now.getTime() - releasedWithinDays * 24 * 60 * 60 * 1000)
    mediaWhere.release_date = { gte: floor, lte: now }
  }
  if (lifecycleStatus !== undefined) {
    mediaWhere.lifecycle_status = lifecycleStatus
  }
  // The composite "in_progress" filter pins lifecycle_status='continuing' on
  // the media item AND status=WATCHING on the UserEntry. Mutually exclusive
  // with an explicit `status` override (the AC ergonomic is a single click).
  if (lifecycleInProgress) {
    mediaWhere.lifecycle_status = 'continuing'
  }

  const where: Prisma.UserEntryWhereInput = {}
  if (lifecycleInProgress) {
    where.status = WatchStatus.WATCHING
  } else if (status) {
    where.status = status
  }
  if (Object.keys(mediaWhere).length > 0) where.media_item = mediaWhere

  // releasedWithinDays forces ordering by release_date desc to match
  // dashboard "Recently Released" semantics, regardless of caller's sort param.
  const effectiveSort: LibrarySortKey =
    releasedWithinDays !== undefined ? 'release_date_desc' : sort

  const orderBy = buildOrderBy(effectiveSort)

  const entries: UserEntryWithMedia[] = await db.userEntry.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: { media_item: true },
    orderBy,
    take: limit,
  })

  // Attach per-show episode stats to TV_SHOW entries. Single batched query
  // for totals + a flat findMany for COMPLETED episode UserEntries grouped
  // in JS. Cheaper than N per-show aggregates; correct for the single-user
  // tracker's scale.
  await attachEpisodeStats(entries)

  return entries
}

async function attachEpisodeStats(
  entries: UserEntryWithMedia[],
): Promise<void> {
  const showIds = entries
    .filter((e) => e.media_item.type === MediaType.TV_SHOW)
    .map((e) => e.media_item.id)
  if (showIds.length === 0) return

  // Totals: count aired (non-unaired) episodes per show.
  const totals = await db.mediaItem.groupBy({
    by: ['parent_id'],
    where: {
      parent_id: { in: showIds },
      type: MediaType.TV_EPISODE,
      unaired: false,
    },
    _count: { id: true },
  })
  const totalsMap = new Map<string, number>()
  for (const row of totals) {
    if (row.parent_id !== null) totalsMap.set(row.parent_id, row._count.id)
  }

  // Watched episodes — fetch (parent_id, season_number, episode_number) for
  // every COMPLETED UserEntry whose MediaItem is an episode of a show in our
  // result set. Group in JS to compute per-show stats.
  const watchedEpisodes = await db.userEntry.findMany({
    where: {
      status: WatchStatus.COMPLETED,
      media_item: {
        parent_id: { in: showIds },
        type: MediaType.TV_EPISODE,
      },
    },
    select: {
      media_item: {
        select: {
          parent_id: true,
          season_number: true,
          episode_number: true,
        },
      },
    },
  })

  type Accum = { watched: number; latestS: number; latestE: number }
  const watchedMap = new Map<string, Accum>()
  for (const row of watchedEpisodes) {
    const pid = row.media_item.parent_id
    if (pid === null) continue
    // Skip rows where season/episode are both null — they can't contribute a
    // meaningful "latest watched" position. The episode normaliser populates
    // both for TMDB episodes; nulls are corruption or pre-7.2 backfill rows.
    if (row.media_item.season_number === null && row.media_item.episode_number === null) {
      continue
    }
    const s = row.media_item.season_number ?? 0
    const ep = row.media_item.episode_number ?? 0
    // Initial sentinel is -1/-1 so a Specials S0E0 episode wins on the first
    // comparison (0 > -1) instead of tying with the accumulator default.
    const cur = watchedMap.get(pid) ?? { watched: 0, latestS: -1, latestE: -1 }
    cur.watched += 1
    if (s > cur.latestS || (s === cur.latestS && ep > cur.latestE)) {
      cur.latestS = s
      cur.latestE = ep
    }
    watchedMap.set(pid, cur)
  }

  for (const entry of entries) {
    if (entry.media_item.type !== MediaType.TV_SHOW) continue
    const total = totalsMap.get(entry.media_item.id) ?? 0
    const watched = watchedMap.get(entry.media_item.id)
    entry.episodeStats = {
      total,
      watched: watched?.watched ?? 0,
      latestS: watched && watched.watched > 0 ? watched.latestS : null,
      latestE: watched && watched.watched > 0 ? watched.latestE : null,
    }
  }
}

// Shared between `/api/library` (wire serializer) and `app/(media)/tv/page.tsx`
// (SSR fetch path). Lifting the formatter here keeps both call sites in sync
// when the AC's progress wording changes.
export function formatTvProgressLabel(
  status: WatchStatus,
  stats: EpisodeStats | undefined,
): string | null {
  if (!stats || stats.total === 0) {
    if (status === WatchStatus.PLAN_TO_WATCH) return null
    return status.replaceAll('_', ' ')
  }
  if (stats.watched === 0) {
    if (status === WatchStatus.PLAN_TO_WATCH) return null
    return status.replaceAll('_', ' ')
  }
  return `S${stats.latestS}E${stats.latestE} / ${stats.total}`
}

export function formatTvProgressPct(
  stats: EpisodeStats | undefined,
): number | null {
  if (!stats || stats.total === 0) return null
  return Math.round((stats.watched / stats.total) * 100)
}

// Wire serializer shared by `/api/library` (GET) and the per-medium grid SSR
// pages (`app/(media)/{movies,tv,anime,manga,games}/page.tsx`). Defining it
// once guarantees the SSR `initialItems` and the client refetch response are
// identical, so TanStack Query never flashes from a hand-rolled SSR shape to
// the real serializer output on the first refetch (the Story 6.3 EH-4 defect).
// Sentinel detection lives in lib/normalise/release-date.ts so the grid
// serializer, the detail pages, and the timeline (Story 10.2) all agree.
function deriveYear(mediaItem: MediaItem): number | null {
  return deriveDisplayYear(mediaItem.release_date)
}

function deriveReleaseDate(mediaItem: MediaItem): string | null {
  return deriveDisplayDate(mediaItem.release_date)
}

function formatProgressLabel(entry: UserEntryWithMedia): string | null {
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

function formatProgressPct(entry: UserEntryWithMedia): number | null {
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
  if (mediaItem.steam_app_id !== null) return 'From Steam'
  return null
}

// IGDB stores bare `image_id` strings per NFR15. Construct the full CDN URL at
// the serialisation boundary so the existing client-side `getImageUrl`
// http-passthrough carries it through unchanged.
function gameCoverUrl(mediaItem: MediaItem): string | null {
  return mediaItem.poster_path
    ? getGameImageUrl(mediaItem.poster_path, 't_cover_big')
    : null
}

export function serializeLibraryItem(entry: UserEntryWithMedia): LibraryItem {
  const mediaItem = entry.media_item
  const isGame = mediaItem.type === MediaType.GAME
  return {
    id: entry.id,
    mediaItemId: mediaItem.id,
    mediaType: mediaItem.type,
    status: entry.status,
    title: mediaItem.title,
    posterPath: isGame ? gameCoverUrl(mediaItem) : mediaItem.poster_path,
    year: deriveYear(mediaItem),
    releaseDate: deriveReleaseDate(mediaItem),
    progressLabel: formatProgressLabel(entry),
    progressPct: formatProgressPct(entry),
    sourceLabel: deriveSourceLabel(mediaItem),
    tmdbId: mediaItem.tmdb_id,
    anilistId: mediaItem.anilist_id,
    igdbId: mediaItem.igdb_id,
    steamId: mediaItem.steam_app_id,
    achievementSyncStatus: isGame ? mediaItem.achievement_sync_status : null,
    createdAt: entry.created_at.toISOString(),
    updatedAt: entry.updated_at.toISOString(),
    completedAt: entry.completed_at ? entry.completed_at.toISOString() : null,
  }
}

function buildOrderBy(
  sort: LibrarySortKey,
): Prisma.UserEntryOrderByWithRelationInput {
  switch (sort) {
    case 'release_date_desc':
      return { media_item: { release_date: 'desc' } }
    case 'recently_created':
      return { created_at: 'desc' }
    case 'title_asc':
      return { media_item: { title: 'asc' } }
    case 'status_asc':
      return { status: 'asc' }
    case 'rating_desc':
      return { media_item: { rating: 'desc' } }
    case 'recently_added':
    default:
      return { updated_at: 'desc' }
  }
}
