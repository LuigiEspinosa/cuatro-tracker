'use client'

import { useCallback, useRef, type KeyboardEvent } from 'react'
import { MediaType } from '@prisma/client'
import { EmptyStateCard } from '@/components/molecules/EmptyStateCard'
import { FramedCover } from '@/components/molecules/FramedCover'
import type { Medium } from '@/components/molecules/FramedCover/media-registry'
import { getImageUrl } from '@/lib/api/tmdb-images'
import type { LibraryItem } from '@/lib/types/library'

export type HorizontalCoverScrollerProps = {
  items: LibraryItem[]
  emptyMessage: string
  emptySubtitle?: string
  ariaLabel: string
}

const MEDIA_TYPE_TO_MEDIUM: Record<MediaType, Medium> = {
  MOVIE: 'movies',
  TV_SHOW: 'tv',
  TV_EPISODE: 'tv',
  ANIME: 'anime',
  MANGA: 'manga',
  GAME: 'games',
}

const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  MOVIE: 'MOVIE',
  TV_SHOW: 'TV',
  TV_EPISODE: 'TV',
  ANIME: 'ANIME',
  MANGA: 'MANGA',
  GAME: 'GAME',
}

const POSTER_PLACEHOLDER =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'

function metaLine(item: LibraryItem): string {
  const medium = MEDIA_TYPE_LABEL[item.mediaType]
  const progress = item.progressLabel
  if (progress === null) return medium
  return `${medium} · ${progress}`
}

export function HorizontalCoverScroller({
  items,
  emptyMessage,
  emptySubtitle,
  ariaLabel,
}: HorizontalCoverScrollerProps) {
  const listRef = useRef<HTMLUListElement | null>(null)

  const focusCardAt = useCallback((idx: number) => {
    const list = listRef.current
    if (list === null) return
    const cards = list.querySelectorAll<HTMLLIElement>('li.hcs-cell')
    const target = cards.item(idx)
    if (target === null) return
    target.focus()
    // scrollIntoView is missing in jsdom; guard so tests don't crash.
    target.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const list = listRef.current
      if (list === null) return
      const cards = Array.from(list.querySelectorAll<HTMLLIElement>('li.hcs-cell'))
      const currentIdx = cards.findIndex((c) => c === document.activeElement)

      // Entry case: keyboard nav reached the band from outside via Tab, then
      // ArrowRight/Left fired on the list (not on a card). Land focus on the
      // first card instead of advancing past it.
      if (currentIdx === -1) {
        event.preventDefault()
        focusCardAt(0)
        return
      }

      const delta = event.key === 'ArrowRight' ? 1 : -1
      const nextIdx = currentIdx + delta
      // Boundary: swallow the key so the overflow-x container doesn't scroll
      // unexpectedly when the user tries to nav past the first/last card.
      if (nextIdx < 0 || nextIdx >= cards.length) {
        event.preventDefault()
        return
      }
      event.preventDefault()
      focusCardAt(nextIdx)
    },
    [focusCardAt],
  )

  if (items.length === 0) {
    return (
      <EmptyStateCard
        variant='band'
        headline={emptyMessage}
        subtitle={emptySubtitle}
      />
    )
  }

  return (
    <div className='hcs-wrap'>
      <ul
        ref={listRef}
        className='hcs'
        role='list'
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
      >
        {items.map((item, i) => {
          const medium = MEDIA_TYPE_TO_MEDIUM[item.mediaType]
          const posterUrl = getImageUrl(item.posterPath, 'w342') ?? POSTER_PLACEHOLDER
          return (
            <li
              key={item.id}
              className='hcs-cell'
              tabIndex={i === 0 ? 0 : -1}
            >
              <div className='hcs-cell-frame'>
                <FramedCover
                  medium={medium}
                  size='scroller'
                  src={posterUrl}
                  alt={item.title}
                />
              </div>
              <p className='hcs-cell-title'>{item.title}</p>
              <p className='hcs-cell-meta'>{metaLine(item)}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
