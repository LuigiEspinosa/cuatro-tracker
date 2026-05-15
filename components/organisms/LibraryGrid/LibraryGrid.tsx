'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { MediaType, WatchStatus } from '@prisma/client'
import {
  FilterSortBar,
  type LifecycleFilter,
  type SortOption,
} from '@/components/molecules/FilterSortBar'
import { EmptyLibraryState } from '@/components/molecules/EmptyLibraryState'
import { MediaCardOverlay } from '@/components/molecules/MediaCardOverlay'
import { FramedCover } from '@/components/molecules/FramedCover'
import { getImageUrl } from '@/lib/api/tmdb-images'
import type { LibraryItem, LibraryListResponse } from '@/lib/types/library'

const MEDIUM_TO_TYPE: Record<'movies' | 'tv' | 'anime' | 'manga' | 'games', MediaType> = {
  movies: MediaType.MOVIE,
  tv: MediaType.TV_SHOW,
  anime: MediaType.ANIME,
  manga: MediaType.MANGA,
  games: MediaType.GAME,
}

const TYPE_TO_MEDIUM: Record<MediaType, 'movies' | 'tv' | 'anime' | 'manga' | 'games'> = {
  MOVIE: 'movies',
  TV_SHOW: 'tv',
  TV_EPISODE: 'tv',
  ANIME: 'anime',
  MANGA: 'manga',
  GAME: 'games',
}

export const MOVIE_SORT_OPTIONS: SortOption[] = [
  { key: 'recently_added', label: 'RECENTLY ADDED' },
  { key: 'title_asc', label: 'TITLE A-Z' },
  { key: 'release_date_desc', label: 'RELEASE DATE' },
  { key: 'status_asc', label: 'STATUS' },
  { key: 'rating_desc', label: 'RATING' },
]

export type LibraryGridProps = {
  mediaType: 'movies' | 'tv' | 'anime' | 'manga' | 'games'
  initialItems: LibraryItem[]
  initialSort: string
  initialStatus: WatchStatus | null
  initialSearch: string
  sortOptions?: SortOption[]
  initialLifecycle?: LifecycleFilter | null
}

type FetchKey = readonly [
  'library',
  'movies' | 'tv' | 'anime' | 'manga' | 'games',
  {
    sort: string
    status: WatchStatus | null
    search: string
    lifecycle: LifecycleFilter | null
  },
]

async function fetchLibrary(
  medium: LibraryGridProps['mediaType'],
  sort: string,
  status: WatchStatus | null,
  search: string,
  lifecycle: LifecycleFilter | null,
  signal: AbortSignal,
): Promise<LibraryItem[]> {
  const params = new URLSearchParams()
  params.set('type', MEDIUM_TO_TYPE[medium])
  params.set('sort', sort)
  if (status) params.set('status', status)
  if (search.trim().length > 0) params.set('search', search.trim())
  if (lifecycle) params.set('lifecycle', lifecycle)
  params.set('limit', '200')
  const res = await fetch(`/api/library?${params.toString()}`, {
    signal,
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`library fetch failed: ${res.status}`)
  const body = (await res.json()) as LibraryListResponse
  return body.items
}

export function LibraryGrid({
  mediaType,
  initialItems,
  initialSort,
  initialStatus,
  initialSearch,
  sortOptions = MOVIE_SORT_OPTIONS,
  initialLifecycle = null,
}: LibraryGridProps) {
  const [sort, setSortState] = useState(initialSort)
  const [status, setStatusState] = useState<WatchStatus | null>(initialStatus)
  const [search, setSearchState] = useState(initialSearch)
  const [lifecycle, setLifecycleState] = useState<LifecycleFilter | null>(
    initialLifecycle,
  )
  const [hasScrolled, setHasScrolled] = useState(false)
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null)
  const gridRef = useRef<HTMLUListElement | null>(null)
  const searchHandleRef = useRef<{ focus: () => void } | null>(null)

  const queryKey = useMemo<FetchKey>(
    () => ['library', mediaType, { sort, status, search, lifecycle }] as const,
    [mediaType, sort, status, search, lifecycle],
  )

  // initialData ONLY seeds the FIRST queryKey (the one the SSR rendered with).
  // Subsequent queryKeys (after filter/sort/search flips) get no initialData
  // so TanStack runs a real fetch instead of reusing stale SSR data with the
  // wrong filters applied. The flag stays true on the first render only;
  // first state change flips it off.
  const isFirstRenderRef = useRef(true)
  const initialDataForQuery = isFirstRenderRef.current ? initialItems : undefined

  const { data: items = initialItems, isLoading, isError } = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      fetchLibrary(mediaType, sort, status, search, lifecycle, signal),
    initialData: initialDataForQuery,
    initialDataUpdatedAt: 0,
    staleTime: 0,
  })

  // URL is written via window.history.replaceState — a true shallow URL
  // update that does NOT trigger Next.js's Server Component refetch. Using
  // router.replace() instead would re-run MoviesPage SSR on every chip click,
  // racing with the client's TanStack Query state and producing the stale-
  // data display Cuatro reported at smoke.
  const writeUrl = useCallback(
    (
      nextSort: string,
      nextStatus: WatchStatus | null,
      nextSearch: string,
      nextLifecycle: LifecycleFilter | null,
    ) => {
      if (typeof window === 'undefined') return
      const params = new URLSearchParams()
      params.set('sort', nextSort)
      if (nextStatus) params.set('status', nextStatus)
      const trimmed = nextSearch.trim()
      if (trimmed.length > 0) params.set('search', trimmed)
      if (nextLifecycle) params.set('lifecycle', nextLifecycle)
      const target = `${window.location.pathname}?${params.toString()}`
      window.history.replaceState(null, '', target)
    },
    [],
  )

  // Flip the first-render flag AFTER the initial render commits. From this
  // point on, queryKey changes get no initialData → real fetches fire.
  useEffect(() => {
    isFirstRenderRef.current = false
  }, [])

  const setSort = useCallback(
    (next: string) => {
      setSortState(next)
      writeUrl(next, status, search, lifecycle)
    },
    [status, search, lifecycle, writeUrl],
  )

  const setStatus = useCallback(
    (next: WatchStatus | null) => {
      setStatusState(next)
      writeUrl(sort, next, search, lifecycle)
    },
    [sort, search, lifecycle, writeUrl],
  )

  const setSearch = useCallback(
    (next: string) => {
      setSearchState(next)
      writeUrl(sort, status, next, lifecycle)
    },
    [sort, status, lifecycle, writeUrl],
  )

  const setLifecycle = useCallback(
    (next: LifecycleFilter | null) => {
      setLifecycleState(next)
      writeUrl(sort, status, search, next)
    },
    [sort, status, search, writeUrl],
  )

  const clearFilters = useCallback(() => {
    setStatusState(null)
    setSearchState('')
    setLifecycleState(null)
    writeUrl(sort, null, '', null)
  }, [sort, writeUrl])

  // Scroll affordance: rainbow rule under the toolbar once scrolled past 80px.
  useEffect(() => {
    function onScroll() {
      setHasScrolled(window.scrollY > 80)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Page-level keyboard: F or / focuses the search input; Escape clears filters + search.
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      const target = e.target
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement &&
          target.getAttribute('contenteditable') === 'true')
      if ((e.key === 'f' || e.key === '/') && !isTyping) {
        e.preventDefault()
        searchHandleRef.current?.focus()
        return
      }
      if (
        e.key === 'Escape' &&
        (status !== null || search !== '' || lifecycle !== null)
      ) {
        e.preventDefault()
        clearFilters()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [status, search, lifecycle, clearFilters])

  // Grid-level arrow navigation. Right at end-of-row jumps to first card of
  // next row; Up at top-row is a no-op (no wrap to last row).
  const handleGridKey = useCallback(
    (e: KeyboardEvent<HTMLUListElement>) => {
      if (!items.length) return
      if (focusedIdx === null) return
      const cols = currentColumnCount(gridRef.current)
      const total = items.length
      let next = focusedIdx
      if (e.key === 'ArrowRight') next = Math.min(focusedIdx + 1, total - 1)
      else if (e.key === 'ArrowLeft') next = Math.max(focusedIdx - 1, 0)
      else if (e.key === 'ArrowDown') next = Math.min(focusedIdx + cols, total - 1)
      else if (e.key === 'ArrowUp') {
        const candidate = focusedIdx - cols
        next = candidate < 0 ? focusedIdx : candidate
      } else return
      e.preventDefault()
      setFocusedIdx(next)
      const cards = gridRef.current?.querySelectorAll<HTMLAnchorElement>(
        '.library-grid-card-link',
      )
      cards?.[next]?.focus()
    },
    [focusedIdx, items.length],
  )

  // Loading + error + filtered-zero + empty-state branching.
  const hasActiveQuery =
    status !== null || search.trim().length > 0 || lifecycle !== null

  return (
    <div className='library-grid'>
      <FilterSortBar
        medium={mediaType}
        search={search}
        onSearchChange={setSearch}
        activeStatus={status}
        onStatusChange={setStatus}
        activeSort={sort}
        sortOptions={sortOptions}
        onSortChange={setSort}
        hasScrolled={hasScrolled}
        searchRef={searchHandleRef}
        activeLifecycle={lifecycle}
        onLifecycleChange={mediaType === 'tv' ? setLifecycle : undefined}
      />
      <div className='library-grid-region'>
        {isError ? (
          <div className='library-grid-error' role='alert'>
            <p className='library-grid-error-title'>&gt; COULD NOT LOAD LIBRARY</p>
            <p className='library-grid-error-sub'>
              Try again or check the connection.
            </p>
          </div>
        ) : items.length === 0 && !isLoading ? (
          hasActiveQuery ? (
            <div className='library-grid-filtered-zero' role='status'>
              <p className='library-grid-filtered-zero-title'>
                &gt; NO RESULTS{search.trim().length > 0 ? ` FOR "${search.trim().toUpperCase()}"` : ''}
              </p>
              <button
                type='button'
                className='library-grid-clear-link'
                onClick={clearFilters}
              >
                CLEAR FILTERS
              </button>
            </div>
          ) : (
            <EmptyLibraryState medium={mediaType} />
          )
        ) : (
          <ul
            ref={gridRef}
            className='library-grid-list'
            role='grid'
            aria-label={`${mediaType} library`}
            onKeyDown={handleGridKey}
          >
            {items.map((item, idx) => {
              const medium = TYPE_TO_MEDIUM[item.mediaType]
              const poster = getImageUrl(item.posterPath, 'w342')
              return (
                <li
                  key={item.id}
                  role='gridcell'
                  className='library-grid-cell'
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '0 320px' }}
                >
                  <Link
                    href={`/${medium}/${item.mediaItemId}`}
                    className='library-grid-card-link'
                    aria-label={`${item.title}${item.year ? `, ${item.year}` : ''}, ${item.status}`}
                    onFocus={() => setFocusedIdx(idx)}
                    tabIndex={idx === (focusedIdx ?? 0) ? 0 : -1}
                  >
                    <div className='library-grid-card' data-medium={medium}>
                      {poster ? (
                        <FramedCover
                          medium={medium}
                          size='card'
                          src={poster}
                          alt={item.title}
                        />
                      ) : (
                        <div className='library-grid-card-fallback' aria-hidden='true'>
                          <span>?</span>
                        </div>
                      )}
                      <span
                        className='library-grid-card-led'
                        data-status={item.status.toLowerCase()}
                        aria-hidden='true'
                      />
                      <MediaCardOverlay
                        title={item.title}
                        year={item.year}
                        mediaType={item.mediaType}
                        status={item.status}
                        progressLabel={item.progressLabel}
                        progressPct={item.progressPct}
                      />
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function currentColumnCount(grid: HTMLUListElement | null): number {
  if (!grid) return 4
  const cs = window.getComputedStyle(grid)
  const cols = cs.getPropertyValue('grid-template-columns').split(' ').length
  return Math.max(1, cols)
}
