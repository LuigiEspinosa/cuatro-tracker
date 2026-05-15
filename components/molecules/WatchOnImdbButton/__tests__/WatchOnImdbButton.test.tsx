import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WatchOnImdbButton } from '../WatchOnImdbButton'

describe('WatchOnImdbButton', () => {
  it('renders nothing when imdbId is null', () => {
    const { container } = render(<WatchOnImdbButton imdbId={null} />)
    expect(container.querySelector('a')).toBeNull()
  })

  it('builds the playimdb URL from the IMDb id', () => {
    render(<WatchOnImdbButton imdbId='tt18925788' />)
    const link = screen.getByRole('link', { name: /WATCH/i })
    expect(link).toHaveAttribute(
      'href',
      'https://www.playimdb.com/es/title/tt18925788/',
    )
  })

  it('opens in a new tab with rel noopener', () => {
    render(<WatchOnImdbButton imdbId='tt0137523' />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toMatch(/noopener/)
  })
})
