'use client'

import { type KeyboardEvent, useMemo, useRef, useEffect } from 'react'
import { CRTPixelButton } from '@/components/atoms/CRTPixelButton'
import { PhosphorLED, type PhosphorLEDStatus } from '@/components/atoms/PhosphorLED'
import { FramedCover } from '@/components/molecules/FramedCover'
import { getImageUrl } from '@/lib/api/tmdb'
import type { UnifiedSearchResult } from '@/lib/search/federation'

type WatchStatus = 'PLAN_TO_WATCH' | 'WATCHING' | 'COMPLETED' | 'ON_HOLD' | 'DROPPED'

export type SearchResultRowProps = {
  result: UnifiedSearchResult
  inLibrary: boolean
  watchStatus?: WatchStatus
  isFocused: boolean
  addingPending: boolean
  onAdd: () => void
  onOpenDetail: () => void
}

const COVER_MEDIUM: Record<UnifiedSearchResult['type'], 'movies' | 'tv' | 'anime' | 'games'> = {
  movie: 'movies',
  tv: 'tv',
  anime: 'anime',
  game: 'games',
}

const WATCH_STATUS_TO_LED: Record<WatchStatus, PhosphorLEDStatus> = {
  PLAN_TO_WATCH: 'backlog',
  WATCHING: 'in-progress',
  COMPLETED: 'completed',
  ON_HOLD: 'on-hold',
  DROPPED: 'dropped',
}

function collectSourceChips(result: UnifiedSearchResult): string[] {
  const chips: string[] = []
  if (result.tmdb_id !== undefined) chips.push('TMDB')
  if (result.anilist_id !== undefined) chips.push('ANILIST')
  if (result.igdb_id !== undefined) chips.push('IGDB')
  if (result.steam_id !== undefined) chips.push('STEAM')
  return chips
}

export function SearchResultRow({
  result,
  inLibrary,
  watchStatus,
  isFocused,
  addingPending,
  onAdd,
  onOpenDetail,
}: SearchResultRowProps) {
  const liRef = useRef<HTMLLIElement | null>(null)
  const posterUrl = getImageUrl(result.poster_path ?? null, 'w185')
  const chips = useMemo(() => collectSourceChips(result), [result])

  // When this row becomes focused via keyboard nav, scroll it into view + focus
  // the underlying <li> so screen readers + visible-focus ring align.
  useEffect(() => {
    if (isFocused && liRef.current) {
      liRef.current.focus()
      // scrollIntoView is missing in jsdom; guard so tests don't crash.
      liRef.current.scrollIntoView?.({ block: 'nearest', behavior: 'auto' })
    }
  }, [isFocused])

  function handleKeyDown(event: KeyboardEvent<HTMLLIElement>) {
    if (event.key === 'Enter' && !(event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (inLibrary) onOpenDetail()
      else onOpenDetail()
    } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (!inLibrary && !addingPending) onAdd()
    }
  }

  const actionLabel = addingPending
    ? '> ADDING…'
    : inLibrary
      ? '✓ IN LIBRARY'
      : '> ADD TO LIBRARY'

  return (
    <li
      ref={liRef}
      className='sr-row'
      data-focused={isFocused ? 'true' : 'false'}
      data-medium={result.type}
      role='option'
      aria-selected={isFocused}
      tabIndex={isFocused ? 0 : -1}
      onKeyDown={handleKeyDown}
    >
      <div className='sr-cover'>
        {posterUrl ? (
          <FramedCover
            medium={COVER_MEDIUM[result.type]}
            size='thumb'
            src={posterUrl}
            alt={result.title}
          />
        ) : (
          <div className='sr-cover-fallback' aria-hidden='true'>
            ?
          </div>
        )}
      </div>
      <div className='sr-body'>
        <h3 className='sr-title'>{result.title}</h3>
        <div className='sr-meta'>
          <span>{result.type.toUpperCase()}</span>
          <span className='sr-sep'>·</span>
          <span>{result.release_year ?? '—'}</span>
          {inLibrary && watchStatus ? (
            <>
              <span className='sr-sep'>·</span>
              <PhosphorLED
                status={WATCH_STATUS_TO_LED[watchStatus]}
                size={8}
                label={watchStatus.replace(/_/g, ' ')}
              />
              <span>{watchStatus.replace(/_/g, ' ')}</span>
            </>
          ) : null}
        </div>
        {result.overview ? <p className='sr-overview'>{result.overview}</p> : null}
      </div>
      <div className='sr-chips'>
        {chips.map((chip) => (
          <span key={chip} className='sr-chip'>
            {chip}
          </span>
        ))}
      </div>
      <div className='sr-action'>
        <CRTPixelButton
          fullWidth={false}
          disabled={addingPending}
          onClick={() => {
            if (inLibrary) onOpenDetail()
            else if (!addingPending) onAdd()
          }}
        >
          {actionLabel}
        </CRTPixelButton>
      </div>
    </li>
  )
}
