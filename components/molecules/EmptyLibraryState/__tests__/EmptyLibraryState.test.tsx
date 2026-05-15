import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  EmptyLibraryState,
  type EmptyLibraryMedium,
} from '@/components/molecules/EmptyLibraryState'

describe('EmptyLibraryState', () => {
  const cases: Array<{
    medium: EmptyLibraryMedium
    title: string
    cta: string
    href: string
  }> = [
    {
      medium: 'movies',
      title: '> NO MOVIES IN LIBRARY',
      cta: '> ADD A MOVIE',
      href: '/search?type=movie',
    },
    {
      medium: 'tv',
      title: '> NO TV SHOWS IN LIBRARY',
      cta: '> ADD A TV SHOW',
      href: '/search?type=tv',
    },
    {
      medium: 'anime',
      title: '> NO ANIME IN LIBRARY',
      cta: '> ADD AN ANIME',
      href: '/search?type=anime',
    },
    {
      medium: 'manga',
      title: '> NO MANGA IN LIBRARY',
      cta: '> ADD A MANGA',
      href: '/search?type=manga',
    },
    {
      medium: 'games',
      title: '> NO GAMES IN LIBRARY',
      cta: '> ADD A GAME',
      href: '/search?type=game',
    },
  ]

  it.each(cases)(
    'renders the per-medium copy and CTA href for $medium',
    ({ medium, title, cta, href }) => {
      const { unmount } = render(<EmptyLibraryState medium={medium} />)
      expect(screen.getByText(title)).toBeInTheDocument()
      expect(screen.getByText(cta)).toBeInTheDocument()
      const link = screen.getByRole('link', { name: cta })
      expect(link.getAttribute('href')).toBe(href)
      unmount()
    },
  )

  it('renders the subtitle inviting the user to search', () => {
    render(<EmptyLibraryState medium='movies' />)
    expect(
      screen.getByText('Search to add one and start tracking.'),
    ).toBeInTheDocument()
  })

  it('uses role="status" for the wrapper', () => {
    const { container } = render(<EmptyLibraryState medium='movies' />)
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })
})
