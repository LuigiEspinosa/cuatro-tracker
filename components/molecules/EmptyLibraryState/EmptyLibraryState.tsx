'use client'

import Link from 'next/link'

export type EmptyLibraryMedium = 'movies' | 'tv' | 'anime' | 'manga' | 'games'

export type EmptyLibraryStateProps = {
  medium: EmptyLibraryMedium
}

type CopyEntry = {
  pluralNoun: string
  ctaLabel: string
  searchType: string
}

const COPY: Record<EmptyLibraryMedium, CopyEntry> = {
  movies: { pluralNoun: 'MOVIES', ctaLabel: '> ADD A MOVIE', searchType: 'movie' },
  tv: { pluralNoun: 'TV SHOWS', ctaLabel: '> ADD A TV SHOW', searchType: 'tv' },
  anime: { pluralNoun: 'ANIME', ctaLabel: '> ADD AN ANIME', searchType: 'anime' },
  manga: { pluralNoun: 'MANGA', ctaLabel: '> ADD A MANGA', searchType: 'manga' },
  games: { pluralNoun: 'GAMES', ctaLabel: '> ADD A GAME', searchType: 'game' },
}

export function EmptyLibraryState({ medium }: EmptyLibraryStateProps) {
  const copy = COPY[medium]
  return (
    <div className='empty-library' role='status'>
      <p className='empty-library-title'>&gt; NO {copy.pluralNoun} IN LIBRARY</p>
      <p className='empty-library-sub'>Search to add one and start tracking.</p>
      <Link
        href={`/search?type=${copy.searchType}`}
        className='empty-library-cta crt-pixel-button'
      >
        {copy.ctaLabel}
      </Link>
    </div>
  )
}
