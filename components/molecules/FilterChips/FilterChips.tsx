'use client'

export type FilterId = 'ALL' | 'MOVIES' | 'TV' | 'ANIME' | 'MANGA' | 'GAMES'

export type FilterChipsProps = {
  active: FilterId
  onChange: (next: FilterId) => void
}

type ChipDef = { id: FilterId; label: string; muted: boolean }

const CHIPS: readonly ChipDef[] = [
  { id: 'ALL', label: 'All', muted: false },
  { id: 'MOVIES', label: 'Movies', muted: false },
  { id: 'TV', label: 'TV', muted: false },
  // Anime + Manga active as of Story 8.3 (federated search dispatches AniList
  // for both). Games remain muted until Epic 9 lands the IGDB / Steam adapter.
  { id: 'ANIME', label: 'Anime', muted: false },
  { id: 'MANGA', label: 'Manga', muted: false },
  { id: 'GAMES', label: 'Games', muted: true },
] as const

export function FilterChips({ active, onChange }: FilterChipsProps) {
  return (
    <div className='fcs' role='tablist' aria-label='Filter by media type'>
      {CHIPS.map((c) => {
        const isActive = c.id === active
        return (
          <button
            key={c.id}
            type='button'
            role='tab'
            className='fcs-chip'
            data-active={isActive ? 'true' : 'false'}
            data-muted={c.muted ? 'true' : 'false'}
            aria-selected={isActive}
            aria-disabled={c.muted}
            onClick={() => {
              if (!c.muted) onChange(c.id)
            }}
          >
            {c.label.toUpperCase()}
            {c.muted ? <em className='fcs-soon'>(soon)</em> : null}
          </button>
        )
      })}
    </div>
  )
}
