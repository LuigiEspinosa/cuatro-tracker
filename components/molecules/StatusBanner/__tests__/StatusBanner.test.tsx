import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusBanner } from '../StatusBanner'

afterEach(() => {
  cleanup()
})

describe('StatusBanner rendering', () => {
  it('renders the primary line with the sb class on the wrapper', () => {
    const { container } = render(
      <StatusBanner variant='error' primary='> ACCESS DENIED' />,
    )
    expect(container.querySelector('.sb')).not.toBeNull()
    expect(screen.getByText('> ACCESS DENIED')).toBeInTheDocument()
  })

  it('applies data-variant matching the variant prop', () => {
    const { container } = render(
      <StatusBanner variant='error' primary='X' />,
    )
    expect(container.querySelector('.sb')).toHaveAttribute('data-variant', 'error')
  })

  it('has role=alert on the wrapper (assertive aria-live is implied by role)', () => {
    render(<StatusBanner variant='error' primary='X' />)
    const banner = screen.getByRole('alert')
    expect(banner).not.toHaveAttribute('aria-live')
  })

  it('warning variant routes primary tone to orange (sets --bt-color to --rb-orange)', () => {
    render(<StatusBanner variant='warning' primary='WARN' />)
    const primary = screen.getByText('WARN')
    expect(primary.style.getPropertyValue('--bt-color')).toBe('var(--rb-orange)')
  })

  it('renders secondary line when provided', () => {
    render(
      <StatusBanner
        variant='error'
        primary='> ACCESS DENIED'
        secondary='INVALID EMAIL OR PASSWORD'
      />,
    )
    expect(screen.getByText('INVALID EMAIL OR PASSWORD')).toBeInTheDocument()
  })

  it('omits secondary line when not provided', () => {
    const { container } = render(
      <StatusBanner variant='error' primary='> ACCESS DENIED' />,
    )
    expect(container.querySelector('.sb-secondary')).toBeNull()
  })

  it('error variant routes primary tone to magenta (sets --bt-color)', () => {
    render(<StatusBanner variant='error' primary='ERR' />)
    const primary = screen.getByText('ERR')
    expect(primary.style.getPropertyValue('--bt-color')).toBe('var(--magenta)')
  })

  it('info variant routes primary tone to cream', () => {
    render(<StatusBanner variant='info' primary='INFO' />)
    const primary = screen.getByText('INFO')
    expect(primary.style.getPropertyValue('--bt-color')).toBe('var(--phosphor-cream)')
  })

  it('passes the className prop through alongside the sb base', () => {
    const { container } = render(
      <StatusBanner variant='error' primary='X' className='extra' />,
    )
    const sb = container.querySelector('.sb')
    expect(sb).toHaveClass('sb')
    expect(sb).toHaveClass('extra')
  })
})
