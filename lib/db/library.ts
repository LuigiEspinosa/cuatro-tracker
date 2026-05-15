import { type MediaItem, type Prisma, type UserEntry, MediaType, WatchStatus } from '@prisma/client'
import { db } from '@/lib/db'

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
