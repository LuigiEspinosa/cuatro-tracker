import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { FilterChips } from '../FilterChips'

describe('FilterChips', () => {
  beforeEach(() => {
    cleanup()
  })

  it('renders 5 chips: ALL, MOVIES, TV, ANIME, GAMES', () => {
    render(<FilterChips active='ALL' onChange={() => {}} />)

    expect(screen.getByRole('tab', { name: /^ALL/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^MOVIES/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^TV/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^ANIME/ })).toBeInTheDocument()
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

  it('renders the (soon) suffix on muted chips (ANIME, GAMES)', () => {
    render(<FilterChips active='ALL' onChange={() => {}} />)

    const anime = screen.getByRole('tab', { name: /^ANIME/ })
    const games = screen.getByRole('tab', { name: /^GAMES/ })
    const movies = screen.getByRole('tab', { name: /^MOVIES/ })

    expect(anime.textContent).toContain('(soon)')
    expect(games.textContent).toContain('(soon)')
    expect(movies.textContent).not.toContain('(soon)')
  })

  it('marks muted chips with aria-disabled + data-muted', () => {
    render(<FilterChips active='ALL' onChange={() => {}} />)

    const anime = screen.getByRole('tab', { name: /^ANIME/ })
    expect(anime.getAttribute('aria-disabled')).toBe('true')
    expect(anime.getAttribute('data-muted')).toBe('true')

    const all = screen.getByRole('tab', { name: /^ALL/ })
    expect(all.getAttribute('aria-disabled')).toBe('false')
    expect(all.getAttribute('data-muted')).toBe('false')
  })

  it('fires onChange when a non-muted chip is clicked', () => {
    const onChange = vi.fn()
    render(<FilterChips active='ALL' onChange={onChange} />)

    screen.getByRole('tab', { name: /^TV/ }).click()

    expect(onChange).toHaveBeenCalledExactlyOnceWith('TV')
  })

  it('does NOT fire onChange when a muted chip is clicked', () => {
    const onChange = vi.fn()
    render(<FilterChips active='ALL' onChange={onChange} />)

    screen.getByRole('tab', { name: /^ANIME/ }).click()
    screen.getByRole('tab', { name: /^GAMES/ }).click()

    expect(onChange).not.toHaveBeenCalled()
  })
})
