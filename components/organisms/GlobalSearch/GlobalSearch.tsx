'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CRTPixelButton } from '@/components/atoms/CRTPixelButton'
import { SearchInput, type SearchInputHandle } from '@/components/molecules/SearchInput'
import { FilterChips, type FilterId } from '@/components/molecules/FilterChips'
import { SearchResultRow } from '@/components/molecules/SearchResultRow'
import type { UnifiedSearchResult } from '@/lib/search/federation'

type SearchResponse = {
  results: UnifiedSearchResult[]
  partialFailure: boolean
}

type SearchApiType = 'movie' | 'tv' | 'anime' | 'game'

type AddBody = {
  source: UnifiedSearchResult['primary_source']
  sourceId: number
  type: 'MOVIE' | 'TV_SHOW' | 'ANIME' | 'GAME'
}

type Variant =
  | 'idle'
  | 'loading'
  | 'results'
  | 'partial-failure-with-results'
  | 'partial-failure-empty'
  | 'zero'

const TYPE_TO_API: Record<Exclude<FilterId, 'ALL'>, SearchApiType> = {
  MOVIES: 'movie',
  TV: 'tv',
  ANIME: 'anime',
  GAMES: 'game',
}

const SEARCH_TYPE_TO_MEDIA: Record<UnifiedSearchResult['type'], AddBody['type']> = {
  movie: 'MOVIE',
  tv: 'TV_SHOW',
  anime: 'ANIME',
  game: 'GAME',
}

const SECTION_LABELS: Record<UnifiedSearchResult['type'], string> = {
  movie: 'MOVIES',
  tv: 'TV',
  anime: 'ANIME',
  game: 'GAMES',
}

const SECTION_ORDER: ReadonlyArray<UnifiedSearchResult['type']> = [
  'movie',
  'tv',
  'anime',
  'game',
] as const

function getResultKey(result: UnifiedSearchResult): string {
  const sourceId =
    result.tmdb_id ?? result.anilist_id ?? result.igdb_id ?? result.steam_id
  return `${result.primary_source}:${sourceId ?? 'unknown'}`
}

function getSourceId(result: UnifiedSearchResult): number | undefined {
  switch (result.primary_source) {
    case 'tmdb':
      return result.tmdb_id
    case 'anilist':
      return result.anilist_id
    case 'igdb':
      return result.igdb_id
    case 'steam':
      return result.steam_id
  }
}

function filterToApiType(filter: FilterId): SearchApiType | undefined {
  if (filter === 'ALL') return undefined
  return TYPE_TO_API[filter]
}

async function fetchSearch(
  query: string,
  type: SearchApiType | undefined,
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query })
  if (type) params.set('type', type)
  const res = await fetch(`/api/search?${params.toString()}`, {
    credentials: 'include',
  })
  if (!res.ok) {
    throw new Error(`search_failed:${res.status}`)
  }
  return (await res.json()) as SearchResponse
}

async function addToLibrary(body: AddBody): Promise<unknown> {
  const res = await fetch('/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? `add_failed:${res.status}`)
  }
  return res.json()
}

export function GlobalSearch() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const inputRef = useRef<SearchInputHandle | null>(null)

  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterId>('ALL')
  const [focusedKey, setFocusedKey] = useState<string | null>(null)
  const [pendingAdds, setPendingAdds] = useState<Set<string>>(() => new Set())

  const apiType = filterToApiType(activeFilter)

  const searchQuery = useQuery<SearchResponse, Error>({
    queryKey: ['search', query, apiType ?? 'all'],
    queryFn: () => fetchSearch(query, apiType),
    enabled: query.length > 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })

  const addMutation = useMutation<unknown, Error, AddBody, { key: string }>({
    mutationFn: addToLibrary,
    onMutate: (body) => {
      const key = `${body.source}:${body.sourceId}`
      setPendingAdds((prev) => {
        const next = new Set(prev)
        next.add(key)
        return next
      })
      return { key }
    },
    onSuccess: (_data, body, ctx) => {
      if (ctx?.key) {
        setPendingAdds((prev) => {
          const next = new Set(prev)
          next.delete(ctx.key)
          return next
        })
      }
      const lowerType = body.type.toLowerCase().split('_')[0]
      void queryClient.invalidateQueries({ queryKey: ['library', lowerType] })
      toast.success('ADDED TO LIBRARY', {
        description: `Source: ${body.source.toUpperCase()} · ${body.type.replace(/_/g, ' ')}`,
      })
    },
    onError: (err, _body, ctx) => {
      if (ctx?.key) {
        setPendingAdds((prev) => {
          const next = new Set(prev)
          next.delete(ctx.key)
          return next
        })
      }
      const reason =
        err.message.startsWith('add_failed:5') || err.message === 'upstream_failed'
          ? 'Upstream unavailable. Please retry.'
          : err.message === 'unsupported_source_type'
            ? 'This media type is not wired yet.'
            : 'Could not add to library.'
      toast.error('COULD NOT ADD', { description: reason })
    },
  })

  const data = searchQuery.data
  const variant: Variant = useMemo(() => {
    if (query.length === 0) return 'idle'
    if (searchQuery.isPending || searchQuery.isFetching) return 'loading'
    if (searchQuery.isError) return 'zero'
    if (!data) return 'loading'
    if (data.partialFailure && data.results.length > 0)
      return 'partial-failure-with-results'
    if (data.partialFailure) return 'partial-failure-empty'
    if (data.results.length === 0) return 'zero'
    return 'results'
  }, [query, data, searchQuery.isPending, searchQuery.isFetching, searchQuery.isError])

  const flatOrder = useMemo<UnifiedSearchResult[]>(() => {
    if (!data?.results.length) return []
    const order: UnifiedSearchResult[] = []
    for (const type of SECTION_ORDER) {
      for (const r of data.results) if (r.type === type) order.push(r)
    }
    return order
  }, [data])

  // Reset focus on new query / filter change.
  useEffect(() => {
    setFocusedKey(null)
  }, [query, activeFilter])

  const handleAdd = useCallback(
    (result: UnifiedSearchResult) => {
      const sourceId = getSourceId(result)
      if (sourceId === undefined) return
      addMutation.mutate({
        source: result.primary_source,
        sourceId,
        type: SEARCH_TYPE_TO_MEDIA[result.type],
      })
    },
    [addMutation],
  )

  const handleOpenDetail = useCallback(
    (result: UnifiedSearchResult) => {
      const sourceId = getSourceId(result)
      if (sourceId === undefined) return
      const path = `/${COVER_PATH_PREFIX[result.type]}/${sourceId}`
      router.push(path)
    },
    [router],
  )

  const handleRetry = useCallback(() => {
    void searchQuery.refetch()
  }, [searchQuery])

  const focusedResult = useMemo(
    () => flatOrder.find((r) => getResultKey(r) === focusedKey) ?? null,
    [flatOrder, focusedKey],
  )

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setQuery('')
      inputRef.current?.focus()
      return
    }
    if (flatOrder.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const currentIndex = focusedKey
        ? flatOrder.findIndex((r) => getResultKey(r) === focusedKey)
        : -1
      const next = (currentIndex + 1) % flatOrder.length
      setFocusedKey(getResultKey(flatOrder[next]))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const currentIndex = focusedKey
        ? flatOrder.findIndex((r) => getResultKey(r) === focusedKey)
        : flatOrder.length
      const next = (currentIndex - 1 + flatOrder.length) % flatOrder.length
      setFocusedKey(getResultKey(flatOrder[next]))
      return
    }
    if (event.key === 'Enter') {
      if (!focusedResult) return
      event.preventDefault()
      if (event.metaKey || event.ctrlKey) {
        const key = getResultKey(focusedResult)
        if (!pendingAdds.has(key)) handleAdd(focusedResult)
      } else {
        handleOpenDetail(focusedResult)
      }
    }
  }

  return (
    <div className='gs' onKeyDown={handleKeyDown}>
      <header className='gs-header'>
        <div className='gs-heading'>
          <h1 className='gs-title'>
            <span className='gs-blocks'>
              <span className='gs-b1'>▓</span>
              <span className='gs-b2'>▓</span>
              <span className='gs-b3'>▓</span>
            </span>
            <span className='gs-label'>SEARCH</span>
            <span className='gs-blocks'>
              <span className='gs-b3'>▓</span>
              <span className='gs-b2'>▓</span>
              <span className='gs-b1'>▓</span>
            </span>
          </h1>
          <span className='gs-tag'>FIND · LOG · REMEMBER</span>
        </div>
        <SearchInput ref={inputRef} value={query} onChange={setQuery} />
        <FilterChips active={activeFilter} onChange={setActiveFilter} />
      </header>

      <main className='gs-results' aria-live='polite'>
        {variant === 'idle' && (
          <EmptyState
            headline='> START TYPING TO SEARCH'
            sub='Search across TMDB · AniList · IGDB · Steam. Press ⌘+Enter on a result to add to library.'
          />
        )}
        {variant === 'loading' && <SkeletonRows count={6} />}
        {variant === 'zero' && (
          <EmptyState
            headline='> NO MATCHES FOUND'
            sub='Try a different title, or remove the type filter.'
          />
        )}
        {variant === 'partial-failure-empty' && (
          <PartialFailureBanner onRetry={handleRetry} />
        )}
        {(variant === 'results' || variant === 'partial-failure-with-results') &&
          data && (
            <>
              {variant === 'partial-failure-with-results' && (
                <PartialFailureBanner onRetry={handleRetry} />
              )}
              {SECTION_ORDER.map((type) => {
                const rows = data.results.filter((r) => r.type === type)
                if (rows.length === 0) return null
                return (
                  <section key={type} className='gs-section'>
                    <div className='gs-section-header'>
                      <span className='gs-section-label'>{SECTION_LABELS[type]}</span>
                      <span className='gs-section-count'>
                        {rows.length} {rows.length === 1 ? 'result' : 'results'}
                      </span>
                      <span className='gs-section-rule' aria-hidden='true' />
                    </div>
                    <ul className='gs-list' role='listbox'>
                      {rows.map((r) => {
                        const key = getResultKey(r)
                        return (
                          <SearchResultRow
                            key={key}
                            result={r}
                            inLibrary={false}
                            isFocused={focusedKey === key}
                            addingPending={pendingAdds.has(key)}
                            onAdd={() => handleAdd(r)}
                            onOpenDetail={() => handleOpenDetail(r)}
                          />
                        )
                      })}
                    </ul>
                  </section>
                )
              })}
            </>
          )}
      </main>

      <footer className='gs-footer' aria-hidden='true'>
        <span>
          <span className='gs-kbd'>↑↓</span>Navigate
        </span>
        <span>
          <span className='gs-kbd'>↵</span>Open detail
        </span>
        <span>
          <span className='gs-kbd'>⌘ ↵</span>Add to library
        </span>
        <span>
          <span className='gs-kbd'>Esc</span>Clear
        </span>
      </footer>
    </div>
  )
}

const COVER_PATH_PREFIX: Record<UnifiedSearchResult['type'], string> = {
  movie: 'movies',
  tv: 'tv',
  anime: 'anime',
  game: 'games',
}

function EmptyState({ headline, sub }: { headline: string; sub: string }) {
  return (
    <div className='gs-empty' role='status'>
      <div className='gs-empty-headline'>{headline}</div>
      <p className='gs-empty-sub'>{sub}</p>
    </div>
  )
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <ul className='gs-skel-list' aria-hidden='true'>
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className='gs-skel-row'>
          <div className='gs-skel-cover' />
          <div className='gs-skel-body'>
            <div className='gs-skel-title' />
            <div className='gs-skel-meta' />
            <div className='gs-skel-line' />
            <div className='gs-skel-line short' />
          </div>
          <div className='gs-skel-chip' />
          <div className='gs-skel-button' />
        </li>
      ))}
    </ul>
  )
}

function PartialFailureBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div className='gs-banner' role='alert'>
      <div className='gs-banner-body'>
        <div className='gs-banner-title'>⚠ SOME SOURCES UNAVAILABLE</div>
        <div className='gs-banner-sub'>
          Showing partial results. Retry to fetch again.
        </div>
      </div>
      <CRTPixelButton fullWidth={false} onClick={onRetry}>
        &gt; RETRY
      </CRTPixelButton>
    </div>
  )
}
