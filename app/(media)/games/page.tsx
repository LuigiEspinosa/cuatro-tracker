import { MediaType, WatchStatus } from '@prisma/client'
import { findLibraryItems, serializeLibraryItem, type LibrarySortKey } from '@/lib/db/library'
import { LibraryGrid } from '@/components/organisms/LibraryGrid'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'GAMES · Cuatro Tracker',
}

const VALID_SORTS: ReadonlyArray<LibrarySortKey> = [
  'recently_added',
  'recently_created',
  'release_date_desc',
  'title_asc',
  'status_asc',
  'rating_desc',
]

type SearchParams = Promise<{
  sort?: string
  status?: string
  search?: string
}>

function parseSort(raw: string | undefined): LibrarySortKey {
  if (raw && (VALID_SORTS as readonly string[]).includes(raw)) {
    return raw as LibrarySortKey
  }
  return 'recently_added'
}

function parseStatus(raw: string | undefined): WatchStatus | null {
  if (!raw) return null
  if ((Object.values(WatchStatus) as string[]).includes(raw)) {
    return raw as WatchStatus
  }
  return null
}

export default async function GamesPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const sort = parseSort(params.sort)
  const status = parseStatus(params.status)
  // Cap at 100 chars to match the LibraryQuerySchema upper bound, otherwise
  // the client-side TanStack Query refetch would reject with 400 and flash
  // the error state immediately after the SSR-rendered grid hydrates.
  const search = (params.search?.trim() ?? '').slice(0, 100)

  const entries = await findLibraryItems({
    mediaType: MediaType.GAME,
    status: status ?? undefined,
    search: search.length > 0 ? search : undefined,
    sort,
    limit: 200,
  })

  const initialItems = entries.map(serializeLibraryItem)

  return (
    <main className='movies-page'>
      <header className='movies-page-heading'>
        <h1 className='movies-page-title'>
          <span className='movies-page-blocks'>
            <span className='movies-page-block b1'>▓</span>
            <span className='movies-page-block b2'>▓</span>
            <span className='movies-page-block b3'>▓</span>
          </span>
          <span className='movies-page-noun'>GAMES</span>
          <span className='movies-page-blocks'>
            <span className='movies-page-block b4'>▓</span>
            <span className='movies-page-block b5'>▓</span>
            <span className='movies-page-block b6'>▓</span>
          </span>
        </h1>
        <p className='movies-page-subtitle'>
          {initialItems.length} ITEMS
        </p>
      </header>
      <LibraryGrid
        mediaType='games'
        initialItems={initialItems}
        initialSort={sort}
        initialStatus={status}
        initialSearch={search}
      />
    </main>
  )
}
