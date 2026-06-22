'use client'

import { type ReactNode } from 'react'

export type FilterChipProps = {
  active: boolean
  label: string
  onToggle: () => void
  ariaLabel?: string
  children?: ReactNode
  // Roving-tabindex + disabled support (Story 10.6). The timeline strip makes
  // each chip group one tab stop and greys the whole strip on an empty library.
  // Both default to the standalone-button behavior the grid FilterSortBar relies
  // on (every chip independently tabbable and enabled).
  tabIndex?: number
  disabled?: boolean
}

export function FilterChip({
  active,
  label,
  onToggle,
  ariaLabel,
  tabIndex,
  disabled,
}: FilterChipProps) {
  return (
    <button
      type='button'
      className='filter-chip'
      data-active={active ? 'true' : 'false'}
      aria-pressed={active}
      aria-label={ariaLabel ?? `${active ? 'Active' : 'Inactive'} filter: ${label}`}
      tabIndex={tabIndex}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className='filter-chip-label'>{label.toUpperCase()}</span>
      {active ? <span className='filter-chip-underline' aria-hidden='true' /> : null}
    </button>
  )
}
