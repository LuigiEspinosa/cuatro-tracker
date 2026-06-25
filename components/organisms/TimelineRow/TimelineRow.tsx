'use client'

// Client organism: the franchise summary row owns its expand/collapse state via
// useState. Normal rows still carry no handlers (navigation rides a plain
// next/link), but keeping the one stateful variant in this file avoids a second
// component for what the AC frames as TimelineRow chrome.

import { useState } from 'react'
import Link from 'next/link'
import type { MediaType, WatchStatus } from '@prisma/client'
import { PhosphorLED } from '@/components/atoms/PhosphorLED'
import { FramedCover } from '@/components/molecules/FramedCover'
import { getImageUrl } from '@/lib/api/tmdb-images'
import { detailRouteFor } from '@/lib/detail-route'
import type { SortMode } from '@/lib/timeline'
import {
  STATUS_LABEL_BY_MEDIA_TYPE,
  TYPE_LABEL,
  TYPE_TO_MEDIUM,
  WATCH_STATUS_TO_LED,
} from '@/lib/ui/media-display'

/* One chronological row: framed thumb, display-serif title, small-caps meta,
 * optional 2-line description, status LED, and a right-aligned date column whose
 * field tracks the active sort mode. Structurally a denser sibling of
 * SearchResultRow. A franchise-mode summary row (item.entries set) renders a
 * distinct chrome instead: no cover, a small-caps FRANCHISE tag, a count chip,
 * and a chevron that expands the collapsed children in place. NFR26: no per-row
 * entrance or hover animation, the focus ring is the only affordance, and the
 * chevron rotation is a CSS transition, never a motion library.
 */

export type TimelineRowItem = {
  id: string
  mediaItemId: string
  mediaType: MediaType
  status: WatchStatus
  title: string
  posterPath: string | null
  year: number | null
  // Optional 2-line description. LibraryItem carries none today, so the timeline
  // renders without it for now (wiring a synopsis is an additive follow-up).
  description?: string | null
  release_date: Date
  completed_at: Date | null
  created_at: Date
  // Franchise-mode fields. franchise_id is the grouping key and (until a
  // normalized Franchise table lands) the display label. entries is present
  // ONLY on a synthetic summary row and carries the collapsed children.
  franchise_id?: string | null
  entries?: TimelineRowItem[]
}

export type TimelineRowProps = {
  item: TimelineRowItem
  sortMode: SortMode
  // Running index across the whole timeline, drives the alternating row tint so
  // it stays continuous across year-group boundaries.
  index: number
  // Set on the indented child rows a franchise summary expands into.
  isFranchiseChild?: boolean
}

function dateForSort(item: TimelineRowItem, sortMode: SortMode): Date | null {
  switch (sortMode) {
    case 'release_asc':
    case 'release_desc':
      return item.release_date
    case 'consumed_asc':
    case 'consumed_desc':
      return item.completed_at
    case 'added_asc':
      return item.created_at
  }
}

// YYYY-MM-DD in UTC, or a single dash when the active sort has no date for this
// row (an unconsumed item under a consumed_* sort). Exported for the row tests.
export function formatTimelineDate(date: Date | null): string {
  if (date === null) return '-'
  return date.toISOString().slice(0, 10)
}

export function TimelineRow({
  item,
  sortMode,
  index,
  isFranchiseChild,
}: TimelineRowProps) {
  // Hook runs unconditionally (rules-of-hooks); only the summary branch reads it.
  const [expanded, setExpanded] = useState(false)
  const rowClass = `tl-row ${index % 2 === 0 ? 'row-even' : 'row-odd'}`

  // Franchise summary variant (two or more collapsed members). A <button>, not
  // an <a>: a synthetic franchise has no detail page. No FramedCover.
  if (item.entries && item.entries.length > 0) {
    const label = item.franchise_id ?? ''
    const count = item.entries.length
    const dateText = formatTimelineDate(dateForSort(item, sortMode))
    return (
      <>
        <li className='tl-row-li'>
          <button
            type='button'
            className={`${rowClass} tl-franchise-summary`}
            data-franchise-summary=''
            aria-expanded={expanded}
            aria-label={`${label} franchise, ${count} entries, ${expanded ? 'collapse' : 'expand'}`}
            onClick={() => setExpanded((open) => !open)}
          >
            <span
              className='tl-chevron'
              data-expanded={expanded ? 'true' : 'false'}
              aria-hidden='true'
            />
            <span className='tl-title-block'>
              <span className='tl-franchise-tag'>FRANCHISE: {label}</span>
              <span className='tl-title'>{label}</span>
            </span>
            <span className='tl-count-chip'>{count} ENTRIES</span>
            <span className={dateText === '-' ? 'tl-date is-null' : 'tl-date'}>
              {dateText}
            </span>
          </button>
        </li>
        {expanded
          ? item.entries.map((child, childIndex) => (
              <TimelineRow
                key={child.id}
                item={child}
                sortMode={sortMode}
                index={index + 1 + childIndex}
                isFranchiseChild
              />
            ))
          : null}
      </>
    )
  }

  const medium = TYPE_TO_MEDIUM[item.mediaType]
  const posterUrl = getImageUrl(item.posterPath, 'w185')
  const typeLabel = TYPE_LABEL[item.mediaType]
  const metaLine = item.year !== null ? `${typeLabel} · ${item.year}` : typeLabel
  const statusLabel = STATUS_LABEL_BY_MEDIA_TYPE[item.mediaType][item.status]
  const dateText = formatTimelineDate(dateForSort(item, sortMode))
  const href = detailRouteFor({
    mediaType: item.mediaType,
    mediaItemId: item.mediaItemId,
  })
  const liClass = isFranchiseChild ? 'tl-row-li is-franchise-child' : 'tl-row-li'
  // Presence marker for the e2e + collapse assertion; omitted on non-children.
  const childMarker = isFranchiseChild ? '' : undefined

  const inner = (
    <>
      <span className='tl-thumb'>
        {posterUrl ? (
          <FramedCover medium={medium} size='thumb' src={posterUrl} alt={item.title} />
        ) : (
          <span className='tl-thumb-fallback' aria-hidden='true'>
            ?
          </span>
        )}
      </span>
      <span className='tl-title-block'>
        <span className='tl-title'>{item.title}</span>
        <span className='tl-meta'>{metaLine}</span>
        {item.description ? <span className='tl-desc'>{item.description}</span> : null}
      </span>
      <PhosphorLED status={WATCH_STATUS_TO_LED[item.status]} size={8} label={statusLabel} />
      <span className={dateText === '-' ? 'tl-date is-null' : 'tl-date'}>{dateText}</span>
    </>
  )

  if (href === null) {
    return (
      <li className={liClass} data-franchise-child={childMarker}>
        <div className={rowClass} data-medium={medium}>
          {inner}
        </div>
      </li>
    )
  }

  return (
    <li className={liClass} data-franchise-child={childMarker}>
      <Link
        href={href}
        className={rowClass}
        data-medium={medium}
        aria-label={`${item.title}, ${metaLine}, ${statusLabel}`}
      >
        {inner}
      </Link>
    </li>
  )
}
