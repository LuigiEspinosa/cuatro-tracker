'use client'

import { CRTBezel } from '@/components/molecules/CRTBezel'
import { EmptyStateCard } from '@/components/molecules/EmptyStateCard'
import { useChannelFlipNavigate } from '@/components/molecules/ChannelFlipTransition'
import { SectionBand } from '@/components/organisms/SectionBand'

export default function DashboardPage() {
  const { navigate, overlay } = useChannelFlipNavigate()

  return (
    <main className='dash'>
      <section className='dash-hero' aria-label='Currently active'>
        <CRTBezel size='hero' className='dash-hero-bezel'>
          <div className='dash-hero-screen'>
            <EmptyStateCard
              variant='hero'
              headline='LIBRARY EMPTY'
              secondLine='ADD AN ITEM TO BEGIN'
              subtitle='Search any title across TMDB, AniList, IGDB or Steam to start your collection.'
              ctaLabel='ADD'
              onCta={() => {
                void navigate('/search')
              }}
            />
          </div>
        </CRTBezel>
      </section>

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
