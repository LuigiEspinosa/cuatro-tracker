'use client'

// Client organism: it reads the Zustand timeline store, mounts the URL-sync
// hook, and drives the sticky year band from scroll position via
// IntersectionObserver, all of which need the browser.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useShallow } from 'zustand/react/shallow'
import { EmptyStateCard } from '@/components/molecules/EmptyStateCard'
import { EraGroundTint } from '@/components/molecules/EraGroundTint'
import { StickyYearBand } from '@/components/molecules/StickyYearBand'
import { TimelineFilterStrip } from '@/components/organisms/TimelineFilterStrip'
import { TimelineRow } from '@/components/organisms/TimelineRow'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'
import { useTimelineUrlSync } from '@/lib/hooks'
import { RELEASE_DATE_SENTINEL } from '@/lib/normalise/release-date'
import { groupByFranchise, groupByYear, sortTimeline } from '@/lib/timeline'
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
  franchise_id: string | null
}

function toTimelineVM(item: LibraryItem): TimelineVM {
  return {
    ...item,
    // A null releaseDate maps to the sentinel, which groupByYear skips. The
    // server query already excludes sentinel + null, so this is defense in depth.
    release_date: item.releaseDate ? new Date(item.releaseDate) : RELEASE_DATE_SENTINEL,
    completed_at: item.completedAt ? new Date(item.completedAt) : null,
    created_at: new Date(item.createdAt),
    // snake_case grouping key for groupByFranchise, mirrors the date fields above.
    franchise_id: item.franchiseId,
  }
}

export function TimelineView({ initialItems }: TimelineViewProps) {
  useTimelineUrlSync()
  const router = useRouter()
  const reduced = useReducedMotion()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [activeYear, setActiveYear] = useState<number | null>(null)

  const { sortMode, mediaTypes, statuses, titleQuery, franchiseMode } = useTimelineStore(
    useShallow((s) => ({
      sortMode: s.sortMode,
      mediaTypes: s.mediaTypes,
      statuses: s.statuses,
      titleQuery: s.titleQuery,
      franchiseMode: s.franchiseMode,
    })),
  )

  // Project the wire items to view-models once per dataset. The projection does
  // not depend on the filter inputs, so a debounced keystroke re-runs only the
  // filter/sort/group below, not the whole per-item transform.
  const vms = useMemo(() => initialItems.map(toTimelineVM), [initialItems])

  const groups = useMemo(() => {
    // Title search runs before sort + group (AC-4), so the year groupings shrink
    // as the query narrows. Case-insensitive substring over title and the
    // original-language title; an empty query matches everything.
    const q = titleQuery.trim().toLowerCase()
    const filtered = vms.filter((row) => {
      if (!mediaTypes.has(row.mediaType)) return false
      if (!statuses.has(row.status)) return false
      if (q.length > 0) {
        const inTitle = row.title.toLowerCase().includes(q)
        const inOriginal = (row.originalTitle ?? '').toLowerCase().includes(q)
        if (!inTitle && !inOriginal) return false
      }
      return true
    })
    // AC-2 pipeline order: sort, then collapse franchises (when on), then group
    // by year. Collapsing before year-grouping anchors a franchise's summary row
    // to its earliest entry's year. groupByFranchise is sort-stable, so the
    // single sort above still holds and groupByYear needs no re-sort.
    const sorted = sortTimeline(filtered, sortMode)
    const collapsed = franchiseMode ? groupByFranchise(sorted) : sorted
    return groupByYear(collapsed, sortMode)
  }, [vms, mediaTypes, statuses, sortMode, titleQuery, franchiseMode])

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

  // D8 three-way render. The strip is always the first child so it stays present
  // (and forms the sticky stack with the year band) even when filters empty the
  // body. Truly-empty library keeps the LIBRARY EMPTY card; a non-empty library
  // filtered/searched to zero shows NO MATCHES (RESET stays reachable in the
  // strip) without the band or tint, which leaves --ground-base at its flat
  // default and cannot strand the era tint (Story 10.5 reset-on-rerun intent).
  const isEmptyLibrary = initialItems.length === 0

  return (
    <div className='tl-view' ref={rootRef}>
      <TimelineFilterStrip disabled={isEmptyLibrary} />
      {isEmptyLibrary ? (
        <div className='tl-empty'>
          <EmptyStateCard
            variant='hero'
            headline='LIBRARY EMPTY'
            subtitle='Add an item to begin tracking on the timeline.'
            ctaLabel='ADD AN ITEM'
            onCta={() => router.push('/search')}
          />
        </div>
      ) : groups.length === 0 ? (
        <div className='tl-no-matches' role='status'>
          <h2 className='tl-no-matches-title'>NO MATCHES</h2>
          <p className='tl-no-matches-hint'>
            No items match the active filters. Adjust or reset the strip above.
          </p>
        </div>
      ) : (
        <>
          {displayYear !== null ? (
            <StickyYearBand year={displayYear} size={80} reducedMotionOverride={reduced} />
          ) : null}
          <EraGroundTint
            groups={groups}
            activeYear={displayYear}
            containerRef={rootRef}
            reducedMotionOverride={reduced}
          />
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
