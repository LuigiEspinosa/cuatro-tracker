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

  it('renders the (soon) suffix on muted chips (GAMES only, after Epic 8)', () => {
    render(<FilterChips active='ALL' onChange={() => {}} />)

    const games = screen.getByRole('tab', { name: /^GAMES/ })
    const movies = screen.getByRole('tab', { name: /^MOVIES/ })
    const anime = screen.getByRole('tab', { name: /^ANIME/ })
    const manga = screen.getByRole('tab', { name: /^MANGA/ })

    expect(games.textContent).toContain('(soon)')
    expect(movies.textContent).not.toContain('(soon)')
    // ANIME + MANGA unmuted as of Epic 8 retroactive followups; the federated
    // search route dispatches AniList for both.
    expect(anime.textContent).not.toContain('(soon)')
    expect(manga.textContent).not.toContain('(soon)')
  })

  it('marks muted chips with aria-disabled + data-muted (GAMES only)', () => {
    render(<FilterChips active='ALL' onChange={() => {}} />)

    const games = screen.getByRole('tab', { name: /^GAMES/ })
    expect(games.getAttribute('aria-disabled')).toBe('true')
    expect(games.getAttribute('data-muted')).toBe('true')

    const all = screen.getByRole('tab', { name: /^ALL/ })
    expect(all.getAttribute('aria-disabled')).toBe('false')
    expect(all.getAttribute('data-muted')).toBe('false')

    const anime = screen.getByRole('tab', { name: /^ANIME/ })
    expect(anime.getAttribute('aria-disabled')).toBe('false')
    expect(anime.getAttribute('data-muted')).toBe('false')

    const manga = screen.getByRole('tab', { name: /^MANGA/ })
    expect(manga.getAttribute('aria-disabled')).toBe('false')
    expect(manga.getAttribute('data-muted')).toBe('false')
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

  it('does NOT fire onChange when GAMES (muted) is clicked', () => {
    const onChange = vi.fn()
    render(<FilterChips active='ALL' onChange={onChange} />)

    screen.getByRole('tab', { name: /^GAMES/ }).click()

    expect(onChange).not.toHaveBeenCalled()
  })
})
