import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { FilterChips } from '../FilterChips'

describe('FilterChips', () => {
  beforeEach(() => {
    cleanup()
  })

  it('renders 6 chips: ALL, MOVIES, TV, ANIME, MANGA, GAMES', () => {
    render(<FilterChips active='ALL' onChange={() => {}} />)

    expect(screen.getByRole('tab', { name: /^ALL/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^MOVIES/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^TV/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^ANIME/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^MANGA/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^GAMES/ })).toBeInTheDocument()
  })

  it('marks the active chip with aria-selected + data-active', () => {
    render(<FilterChips active='MOVIES' onChange={() => {}} />)

    const active = screen.getByRole('tab', { name: /^MOVIES/ })
    expect(active.getAttribute('aria-selected')).toBe('true')
    expect(active.getAttribute('data-active')).toBe('true')

    const inactive = screen.getByRole('tab', { name: /^TV/ })
    expect(inactive.getAttribute('aria-selected')).toBe('false')
    expect(inactive.getAttribute('data-active')).toBe('false')
  })

  it('no chip renders the (soon) suffix (GAMES unmuted as of Story 9.4)', () => {
    render(<FilterChips active='ALL' onChange={() => {}} />)

    for (const id of ['ALL', 'MOVIES', 'TV', 'ANIME', 'MANGA', 'GAMES']) {
      const chip = screen.getByRole('tab', { name: new RegExp(`^${id}`) })
      expect(chip.textContent).not.toContain('(soon)')
    }
  })

  it('no chip is aria-disabled / data-muted (GAMES unmuted as of Story 9.4)', () => {
    render(<FilterChips active='ALL' onChange={() => {}} />)

    for (const id of ['ALL', 'MOVIES', 'TV', 'ANIME', 'MANGA', 'GAMES']) {
      const chip = screen.getByRole('tab', { name: new RegExp(`^${id}`) })
      expect(chip.getAttribute('aria-disabled')).toBe('false')
      expect(chip.getAttribute('data-muted')).toBe('false')
    }
  })

  it('fires onChange when a non-muted chip is clicked', () => {
    const onChange = vi.fn()
    render(<FilterChips active='ALL' onChange={onChange} />)

    screen.getByRole('tab', { name: /^TV/ }).click()

    expect(onChange).toHaveBeenCalledExactlyOnceWith('TV')
  })

  it('fires onChange for ANIME + MANGA (unmuted as of Epic 8 followups)', () => {
    const onChange = vi.fn()
    render(<FilterChips active='ALL' onChange={onChange} />)

    screen.getByRole('tab', { name: /^ANIME/ }).click()
    expect(onChange).toHaveBeenCalledWith('ANIME')

    screen.getByRole('tab', { name: /^MANGA/ }).click()
    expect(onChange).toHaveBeenCalledWith('MANGA')

    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('fires onChange when GAMES is clicked (unmuted as of Story 9.4)', () => {
    const onChange = vi.fn()
    render(<FilterChips active='ALL' onChange={onChange} />)

    screen.getByRole('tab', { name: /^GAMES/ }).click()

    expect(onChange).toHaveBeenCalledExactlyOnceWith('GAMES')
  })
})
