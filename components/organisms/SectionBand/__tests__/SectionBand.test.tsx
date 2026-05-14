import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SectionBand } from '../SectionBand'

afterEach(() => {
  cleanup()
})

describe('SectionBand rendering', () => {
  it('renders the title as a heading', () => {
    render(
      <SectionBand title='Up Next'>
        <p>body</p>
      </SectionBand>,
    )
    expect(screen.getByRole('heading', { name: 'Up Next' })).toBeInTheDocument()
  })

  it('passes children through to the body slot', () => {
    render(
      <SectionBand title='Up Next'>
        <p data-testid='child'>scrolled content</p>
      </SectionBand>,
    )
    expect(screen.getByTestId('child')).toHaveTextContent('scrolled content')
  })

  it('renders the 6-band rainbow rule with aria-hidden', () => {
    const { container } = render(
      <SectionBand title='Recently Added'>
        <p>body</p>
      </SectionBand>,
    )
    const rule = container.querySelector('.dsec-rule')
    expect(rule).not.toBeNull()
    expect(rule).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelectorAll('.dsec-rule-band')).toHaveLength(6)
  })

  it('renders the count chip when count is a finite number', () => {
    render(
      <SectionBand title='Up Next' count={8}>
        <p>body</p>
      </SectionBand>,
    )
    expect(screen.getByText('8 items')).toBeInTheDocument()
  })

  it('singularizes the count chip when count is 1', () => {
    render(
      <SectionBand title='Up Next' count={1}>
        <p>body</p>
      </SectionBand>,
    )
    expect(screen.getByText('1 item')).toBeInTheDocument()
  })

  it('hides the count chip when count is null', () => {
    const { container } = render(
      <SectionBand title='Up Next' count={null}>
        <p>body</p>
      </SectionBand>,
    )
    expect(container.querySelector('.dsec-count')).toBeNull()
  })

  it('hides the count chip when count is undefined (default)', () => {
    const { container } = render(
      <SectionBand title='Up Next'>
        <p>body</p>
      </SectionBand>,
    )
    expect(container.querySelector('.dsec-count')).toBeNull()
  })

  it('wires aria-labelledby linking the section to the heading id', () => {
    render(
      <SectionBand title='Up Next'>
        <p>body</p>
      </SectionBand>,
    )
    const heading = screen.getByRole('heading', { name: 'Up Next' })
    const section = heading.closest('section')
    expect(section).not.toBeNull()
    expect(section).toHaveAttribute('aria-labelledby', heading.id)
    expect(heading.id).toMatch(/^section-band-/)
  })

  it('passes className through alongside the dsec base', () => {
    const { container } = render(
      <SectionBand title='Up Next' className='extra'>
        <p>body</p>
      </SectionBand>,
    )
    const section = container.querySelector('section')
    expect(section).toHaveClass('dsec')
    expect(section).toHaveClass('extra')
  })
})
