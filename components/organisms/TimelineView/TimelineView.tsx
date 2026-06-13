'use client'

// Client organism: it reads the Zustand timeline store, mounts the URL-sync
// hook, and drives the sticky year band from scroll position via
// IntersectionObserver, all of which need the browser.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useShallow } from 'zustand/react/shallow'
import { EmptyStateCard } from '@/components/molecules/EmptyStateCard'
import { StickyYearBand } from '@/components/molecules/StickyYearBand'
import { TimelineRow } from '@/components/organisms/TimelineRow'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'
import { useTimelineUrlSync } from '@/lib/hooks'
import { RELEASE_DATE_SENTINEL } from '@/lib/normalise/release-date'
import { groupByYear, sortTimeline } from '@/lib/timeline'
import { useTimelineStore } from '@/store/timeline'
import type { LibraryItem } from '@/lib/types/library'

export type TimelineViewProps = {
  initialItems: LibraryItem[]
}

// The render view-model: the wire LibraryItem (camelCase display fields) plus
// the three snake_case Date fields sortTimeline / groupByYear sort and group on.
// No name clash, so the generic functions carry the whole row through.
type TimelineVM = LibraryItem & {
  release_date: Date
  completed_at: Date | null
  created_at: Date
}

function toTimelineVM(item: LibraryItem): TimelineVM {
  return {
    ...item,
    // A null releaseDate maps to the sentinel, which groupByYear skips. The
    // server query already excludes sentinel + null, so this is defense in depth.
    release_date: item.releaseDate ? new Date(item.releaseDate) : RELEASE_DATE_SENTINEL,
    completed_at: item.completedAt ? new Date(item.completedAt) : null,
    created_at: new Date(item.createdAt),
  }
}

export function TimelineView({ initialItems }: TimelineViewProps) {
  useTimelineUrlSync()
  const router = useRouter()
  const reduced = useReducedMotion()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [activeYear, setActiveYear] = useState<number | null>(null)

  const { sortMode, mediaTypes, statuses } = useTimelineStore(
    useShallow((s) => ({
      sortMode: s.sortMode,
      mediaTypes: s.mediaTypes,
      statuses: s.statuses,
    })),
  )

  const groups = useMemo(() => {
    const filtered = initialItems
      .map(toTimelineVM)
      .filter((row) => mediaTypes.has(row.mediaType) && statuses.has(row.status))
    return groupByYear(sortTimeline(filtered, sortMode), sortMode)
  }, [initialItems, mediaTypes, statuses, sortMode])

  // Flatten to (group, row, runningIndex) so the alternating tint is continuous
  // across year-group boundaries.
  const sections = useMemo(() => {
    let running = 0
    return groups.map((group) => {
      const rows = group.entries.map((entry) => {
        const index = running
        running += 1
        return { entry, index }
      })
      return { year: group.year, rows }
    })
  }, [groups])

  useEffect(() => {
    // New dataset: fall back to the first group's year until the observer fires.
    setActiveYear(null)
    const root = rootRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return
    const sentinels = Array.from(
      root.querySelectorAll<HTMLElement>('[data-tl-year]'),
    )
    if (sentinels.length === 0) return

    const band = root.querySelector<HTMLElement>('.syb')
    const bandHeight = band ? Math.round(band.getBoundingClientRect().height) : 120

    // The active year is the group whose sentinel has most recently scrolled up
    // to the band line. Read live rects on each callback rather than a stored
    // offset: a sentinel that stays intersecting never re-fires, so a cached top
    // would go stale. The band line is anchored in pixels (a top inset only, no
    // bottom margin), so detection never collapses on short or zoomed viewports,
    // the failure mode of a percentage-height strip.
    function recompute() {
      let best: number | null = null
      let bestTop = Number.NEGATIVE_INFINITY
      for (const sentinel of sentinels) {
        const raw = sentinel.dataset.tlYear
        if (raw === undefined) continue
        const year = Number(raw)
        if (Number.isNaN(year)) continue
        const top = sentinel.getBoundingClientRect().top
        // Topmost sentinel still at or above the band line is the current group.
        if (top <= bandHeight && top > bestTop) {
          bestTop = top
          best = year
        }
      }
      if (best !== null) setActiveYear(best)
    }

    const observer = new IntersectionObserver(recompute, {
      rootMargin: `-${bandHeight}px 0px 0px 0px`,
      threshold: 0,
    })
    for (const sentinel of sentinels) observer.observe(sentinel)
    return () => observer.disconnect()
  }, [groups])

  const displayYear = activeYear ?? (groups.length > 0 ? groups[0].year : null)

  return (
    <div className='tl-view' ref={rootRef}>
      {groups.length === 0 ? (
        <div className='tl-empty'>
          <EmptyStateCard
            variant='hero'
            headline='LIBRARY EMPTY'
            subtitle='Add an item to begin tracking on the timeline.'
            ctaLabel='ADD AN ITEM'
            onCta={() => router.push('/search')}
          />
        </div>
      ) : (
        <>
          {displayYear !== null ? (
            <StickyYearBand year={displayYear} size={80} reducedMotionOverride={reduced} />
          ) : null}
          <ul className='tl-body'>
            {sections.map((section) => (
              <Fragment key={section.year ?? 'undated'}>
                {section.year !== null ? (
                  <li
                    className='tl-year-sentinel'
                    data-tl-year={section.year}
                    aria-hidden='true'
                  />
                ) : null}
                {section.rows.map(({ entry, index }) => (
                  <TimelineRow
                    key={entry.id}
                    item={entry}
                    sortMode={sortMode}
                    index={index}
                  />
                ))}
              </Fragment>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
