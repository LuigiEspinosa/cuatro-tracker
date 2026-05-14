'use client'

import { useQuery } from '@tanstack/react-query'
import { useChannelFlipNavigate } from '@/components/molecules/ChannelFlipTransition'
import { CurrentlyActiveCarousel } from '@/components/organisms/CurrentlyActiveCarousel'
import { DashboardSystemWidget } from '@/components/organisms/DashboardSystemWidget'
import { HorizontalCoverScroller } from '@/components/organisms/HorizontalCoverScroller'
import { SectionBand } from '@/components/organisms/SectionBand'
import type { LibraryListResponse } from '@/lib/types/library'

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

  return (
    <main className='dash'>
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
  )
}
