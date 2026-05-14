'use client'

export type FilterId = 'ALL' | 'MOVIES' | 'TV' | 'ANIME' | 'GAMES'

export type FilterChipsProps = {
  active: FilterId
  onChange: (next: FilterId) => void
}

type ChipDef = { id: FilterId; label: string; muted: boolean }

const CHIPS: readonly ChipDef[] = [
  { id: 'ALL', label: 'All', muted: false },
  { id: 'MOVIES', label: 'Movies', muted: false },
  { id: 'TV', label: 'TV', muted: false },
  { id: 'ANIME', label: 'Anime', muted: true },
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
