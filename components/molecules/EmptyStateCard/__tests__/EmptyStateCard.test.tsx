import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmptyStateCard } from '../EmptyStateCard'

afterEach(() => {
  cleanup()
})

describe('EmptyStateCard rendering', () => {
  it('defaults to band variant when no variant prop is passed', () => {
    const { container } = render(<EmptyStateCard headline='NOTHING IN PROGRESS' />)
    expect(container.querySelector('.esc')).toHaveAttribute('data-variant', 'band')
  })

  it('renders the bitmap headline with a > prefix', () => {
    render(<EmptyStateCard headline='NOTHING ADDED YET' />)
    expect(screen.getByText('> NOTHING ADDED YET')).toBeInTheDocument()
  })

  it('renders the optional subtitle when provided', () => {
    render(
      <EmptyStateCard
        headline='NO RECENT RELEASES'
        subtitle='Items in your library released in the last 30 days appear here.'
      />,
    )
    expect(
      screen.getByText('Items in your library released in the last 30 days appear here.'),
    ).toBeInTheDocument()
  })

  it('omits the subtitle paragraph when not provided', () => {
    const { container } = render(<EmptyStateCard headline='X' />)
    expect(container.querySelector('.esc-subtitle')).toBeNull()
  })

  it('band variant omits the secondLine even when the prop is set', () => {
    render(
      <EmptyStateCard
        variant='band'
        headline='X'
        secondLine='SHOULD NOT RENDER'
      />,
    )
    expect(screen.queryByText('SHOULD NOT RENDER')).toBeNull()
  })

  it('band variant omits the CTA button even when ctaLabel is set', () => {
    const onCta = vi.fn()
    const { container } = render(
      <EmptyStateCard variant='band' headline='X' ctaLabel='ADD' onCta={onCta} />,
    )
    expect(container.querySelector('.cpb')).toBeNull()
  })

  it('hero variant renders the secondLine when provided', () => {
    render(
      <EmptyStateCard
        variant='hero'
        headline='LIBRARY EMPTY'
        secondLine='ADD AN ITEM TO BEGIN'
      />,
    )
    expect(screen.getByText('ADD AN ITEM TO BEGIN')).toBeInTheDocument()
  })

  it('hero variant renders the CTA button with > prefix when ctaLabel is set', () => {
    render(
      <EmptyStateCard variant='hero' headline='LIBRARY EMPTY' ctaLabel='ADD' />,
    )
    expect(screen.getByRole('button', { name: '> ADD' })).toBeInTheDocument()
  })

  it('calls onCta when the hero CTA is clicked', () => {
    const onCta = vi.fn()
    render(
      <EmptyStateCard
        variant='hero'
        headline='LIBRARY EMPTY'
        ctaLabel='ADD'
        onCta={onCta}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '> ADD' }))
    expect(onCta).toHaveBeenCalledTimes(1)
  })

  it('passes the className prop through alongside the esc base', () => {
    const { container } = render(
      <EmptyStateCard headline='X' className='extra' />,
    )
    const esc = container.querySelector('.esc')
    expect(esc).toHaveClass('esc')
    expect(esc).toHaveClass('extra')
  })
})
