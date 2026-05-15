'use client'

import { type ReactNode } from 'react'

export type FilterChipProps = {
  active: boolean
  label: string
  onToggle: () => void
  ariaLabel?: string
  children?: ReactNode
}

export function FilterChip({
  active,
  label,
  onToggle,
  ariaLabel,
}: FilterChipProps) {
  return (
    <button
      type='button'
      className='filter-chip'
      data-active={active ? 'true' : 'false'}
      aria-pressed={active}
      aria-label={ariaLabel ?? `${active ? 'Active' : 'Inactive'} filter: ${label}`}
      onClick={onToggle}
    >
      <span className='filter-chip-label'>{label.toUpperCase()}</span>
      {active ? <span className='filter-chip-underline' aria-hidden='true' /> : null}
    </button>
  )
}
