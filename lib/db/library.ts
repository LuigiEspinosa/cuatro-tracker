import { type MediaItem, type Prisma, type UserEntry, MediaType, WatchStatus } from '@prisma/client'
import { db } from '@/lib/db'

export type LibrarySortKey =
  | 'recently_added'
  | 'recently_created'
  | 'release_date_desc'
  | 'title_asc'
  | 'status_asc'
  | 'rating_desc'

export type LibraryQueryOptions = {
  mediaType?: MediaType
  status?: WatchStatus
  search?: string
  sort?: LibrarySortKey
  limit?: number
  releasedWithinDays?: number
}

export type UserEntryWithMedia = UserEntry & { media_item: MediaItem }

const DEFAULT_LIMIT = 200
const DEFAULT_SORT: LibrarySortKey = 'recently_added'

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

  const where: Prisma.UserEntryWhereInput = {}
  if (status) where.status = status
  if (Object.keys(mediaWhere).length > 0) where.media_item = mediaWhere

  // releasedWithinDays forces ordering by release_date desc to match
  // dashboard "Recently Released" semantics, regardless of caller's sort param.
  const effectiveSort: LibrarySortKey =
    releasedWithinDays !== undefined ? 'release_date_desc' : sort

  const orderBy = buildOrderBy(effectiveSort)

  return db.userEntry.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: { media_item: true },
    orderBy,
    take: limit,
  })
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
