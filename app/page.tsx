'use client'

import { useCallback, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BootSequence } from '@/components/molecules/BootSequence'
import { useChannelFlipNavigate } from '@/components/molecules/ChannelFlipTransition'
import { CurrentlyActiveCarousel } from '@/components/organisms/CurrentlyActiveCarousel'
import { DashboardSystemWidget } from '@/components/organisms/DashboardSystemWidget'
import { HorizontalCoverScroller } from '@/components/organisms/HorizontalCoverScroller'
import { SectionBand } from '@/components/organisms/SectionBand'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'
import type { LibraryListResponse } from '@/lib/types/library'
import {
  BOOT_TOTAL_DURATION_MS,
  type BootPhase,
  dashClassFor,
  resolveBootPhase,
  safeCommit,
} from './page-boot-gate'

async function fetchJson(url: string): Promise<LibraryListResponse> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`)
  return (await res.json()) as LibraryListResponse
}

const fetchActiveLibrary = () =>
  fetchJson('/api/library?status=WATCHING&order=updated_at_desc&limit=5')
const fetchUpNext = () => fetchJson('/api/dashboard/up-next')
const fetchRecentlyAdded = () =>
  fetchJson('/api/library?order=created_at_desc&limit=20')
const fetchRecentlyReleased = () =>
  fetchJson('/api/library?released_within_days=30&limit=20')

export default function DashboardPage() {
  const { overlay } = useChannelFlipNavigate()
  const reduced = useReducedMotion()
  const [bootPhase, setBootPhase] = useState<BootPhase>('unknown')

  useEffect(() => {
    setBootPhase(resolveBootPhase(reduced))
  }, [reduced])

  const onBootComplete = useCallback(() => {
    safeCommit()
    setBootPhase('skipped')
  }, [])

  // Dashboard subscriptions: fire on mount regardless of bootPhase so data
  // resolves in parallel with the ~1s boot animation per AC-4. The default
  // staleTime: 60_000 in app/providers.tsx prevents re-fetches on tab focus.
  const watchingQuery = useQuery({
    queryKey: ['library', { status: 'WATCHING' }],
    queryFn: fetchActiveLibrary,
  })
  const upNextQuery = useQuery({
    queryKey: ['dashboard', 'up-next'],
    queryFn: fetchUpNext,
  })
  const recentlyAddedQuery = useQuery({
    queryKey: ['dashboard', 'recently-added'],
    queryFn: fetchRecentlyAdded,
  })
  const recentlyReleasedQuery = useQuery({
    queryKey: ['dashboard', 'recently-released'],
    queryFn: fetchRecentlyReleased,
  })

  const watchingItems = watchingQuery.data?.items ?? []
  const upNextItems = upNextQuery.data?.items ?? []
  const recentlyAddedItems = recentlyAddedQuery.data?.items ?? []
  const recentlyReleasedItems = recentlyReleasedQuery.data?.items ?? []

  // SSR returns 'unknown'; the dashboard is mounted (queries fire) but invisible
  // until useEffect resolves. 'playing' adds the dash-ghost dim+blur per the
  // bundle. 'skipped' reveals full opacity.
  const dashClassName = dashClassFor(bootPhase)

  return (
    <>
      <main
        className={dashClassName}
        data-boot-phase={bootPhase}
        aria-hidden={bootPhase === 'playing' || bootPhase === 'unknown'}
      >
        <CurrentlyActiveCarousel items={watchingItems} />

        <SectionBand title='Up Next'>
          <HorizontalCoverScroller
            items={upNextItems}
            emptyMessage='NOTHING IN PROGRESS'
            emptySubtitle='Start watching, reading, or playing to populate this band.'
            ariaLabel='Up Next'
          />
        </SectionBand>

        <SectionBand title='Recently Added'>
          <HorizontalCoverScroller
            items={recentlyAddedItems}
            emptyMessage='NOTHING ADDED YET'
            emptySubtitle='Items you add to your library appear here.'
            ariaLabel='Recently Added'
          />
        </SectionBand>

        <SectionBand title='Recently Released'>
          <HorizontalCoverScroller
            items={recentlyReleasedItems}
            emptyMessage='NO RECENT RELEASES'
            emptySubtitle='Items in your library released in the last 30 days appear here.'
            ariaLabel='Recently Released'
          />
        </SectionBand>

        <DashboardSystemWidget />

        {overlay}
      </main>

      {bootPhase === 'playing' ? (
        <div className='dash-boot-overlay' role='presentation'>
          <BootSequence
            onComplete={onBootComplete}
            totalDuration={BOOT_TOTAL_DURATION_MS}
            showWelcome
          />
        </div>
      ) : null}
    </>
  )
}
