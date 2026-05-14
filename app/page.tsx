'use client'

import { useQuery } from '@tanstack/react-query'
import { EmptyStateCard } from '@/components/molecules/EmptyStateCard'
import { useChannelFlipNavigate } from '@/components/molecules/ChannelFlipTransition'
import { CurrentlyActiveCarousel } from '@/components/organisms/CurrentlyActiveCarousel'
import { SectionBand } from '@/components/organisms/SectionBand'
import type { LibraryListResponse } from '@/lib/types/library'

async function fetchActiveLibrary(): Promise<LibraryListResponse> {
  const res = await fetch('/api/library?status=WATCHING&order=updated_at_desc&limit=5', {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`library fetch failed: ${res.status}`)
  return (await res.json()) as LibraryListResponse
}

export default function DashboardPage() {
  const { overlay } = useChannelFlipNavigate()
  const watchingQuery = useQuery({
    queryKey: ['library', { status: 'WATCHING' }],
    queryFn: fetchActiveLibrary,
  })
  const watchingItems = watchingQuery.data?.items ?? []

  return (
    <main className='dash'>
      <CurrentlyActiveCarousel items={watchingItems} />

      <SectionBand title='Up Next'>
        <EmptyStateCard
          headline='NOTHING IN PROGRESS'
          subtitle='Start watching, reading, or playing to populate this band.'
        />
      </SectionBand>

      <SectionBand title='Recently Added'>
        <EmptyStateCard
          headline='NOTHING ADDED YET'
          subtitle='Items you add to your library appear here.'
        />
      </SectionBand>

      <SectionBand title='Recently Released'>
        <EmptyStateCard
          headline='NO RECENT RELEASES'
          subtitle='Items in your library released in the last 30 days appear here.'
        />
      </SectionBand>

      {overlay}
    </main>
  )
}
