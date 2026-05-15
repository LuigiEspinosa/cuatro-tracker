import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BackToLibraryLink } from '../BackToLibraryLink'

describe('BackToLibraryLink', () => {
  it('renders an anchor to /movies for medium=movies', () => {
    render(<BackToLibraryLink medium='movies' />)
    const link = screen.getByRole('link', { name: /back to library/i })
    expect(link).toHaveAttribute('href', '/movies')
  })

  it('renders an anchor to /tv for medium=tv', () => {
    render(<BackToLibraryLink medium='tv' />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/tv')
  })

  it('renders an svg arrow icon (not a Unicode glyph)', () => {
    const { container } = render(<BackToLibraryLink medium='games' />)
    expect(container.querySelector('svg.back-to-library-link-arrow')).toBeTruthy()
  })
})
