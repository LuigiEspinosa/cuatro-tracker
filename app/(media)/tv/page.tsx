import { MediaType, WatchStatus } from '@prisma/client'
import {
  findLibraryItems,
  serializeLibraryItem,
  type LibrarySortKey,
  type LifecycleStatus,
} from '@/lib/db/library'
import { LibraryGrid } from '@/components/organisms/LibraryGrid'
import type { LifecycleFilter } from '@/components/molecules/FilterSortBar'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'TV · Cuatro Tracker',
}

const VALID_SORTS: ReadonlyArray<LibrarySortKey> = [
  'recently_added',
  'recently_created',
  'release_date_desc',
  'title_asc',
  'status_asc',
  'rating_desc',
]

const VALID_LIFECYCLES: ReadonlyArray<LifecycleFilter> = [
  'in_progress',
  'continuing',
  'ended',
]

type SearchParams = Promise<{
  sort?: string
  status?: string
  search?: string
  lifecycle?: string
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

function parseLifecycle(raw: string | undefined): LifecycleFilter | null {
  if (!raw) return null
  if ((VALID_LIFECYCLES as readonly string[]).includes(raw)) {
    return raw as LifecycleFilter
  }
  return null
}

export default async function TvPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const sort = parseSort(params.sort)
  const status = parseStatus(params.status)
  const lifecycle = parseLifecycle(params.lifecycle)
  const search = (params.search?.trim() ?? '').slice(0, 100)

  const lifecycleStatus: LifecycleStatus | undefined =
    lifecycle === 'continuing' || lifecycle === 'ended' ? lifecycle : undefined
  const lifecycleInProgress = lifecycle === 'in_progress'

  const entries = await findLibraryItems({
    mediaType: MediaType.TV_SHOW,
    status: status ?? undefined,
    search: search.length > 0 ? search : undefined,
    sort,
    limit: 200,
    lifecycleStatus,
    lifecycleInProgress,
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
          <span className='movies-page-noun'>TV</span>
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
        mediaType='tv'
        initialItems={initialItems}
        initialSort={sort}
        initialStatus={status}
        initialSearch={search}
        initialLifecycle={lifecycle}
      />
    </main>
  )
}
