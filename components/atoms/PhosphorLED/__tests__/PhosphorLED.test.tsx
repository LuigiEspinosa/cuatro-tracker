import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PhosphorLED, type PhosphorLEDStatus } from '../PhosphorLED'

afterEach(() => {
  cleanup()
})

const STATUSES: PhosphorLEDStatus[] = ['completed', 'in-progress', 'backlog', 'dropped', 'on-hold']

describe('PhosphorLED rendering (AC-1)', () => {
  it.each(STATUSES)('renders status=%s with matching data-status attribute', (status) => {
    render(<PhosphorLED status={status} label={`status ${status}`} />)
    const led = screen.getByRole('img', { name: `status ${status}` })
    expect(led).toHaveAttribute('data-status', status)
  })

  it('default size is 8 (px) when prop omitted', () => {
    render(<PhosphorLED status='completed' label='ok' />)
    const led = screen.getByRole('img', { name: 'ok' })
    expect(led).toHaveStyle({ width: '8px', height: '8px' })
  })

  it('explicit size prop overrides the default', () => {
    render(<PhosphorLED status='completed' label='ok' size={16} />)
    const led = screen.getByRole('img', { name: 'ok' })
    expect(led).toHaveStyle({ width: '16px', height: '16px' })
  })

  it('label propagates to aria-label and title (a11y + tooltip)', () => {
    render(<PhosphorLED status='in-progress' label='currently watching' />)
    const led = screen.getByRole('img', { name: 'currently watching' })
    expect(led).toHaveAttribute('aria-label', 'currently watching')
    expect(led).toHaveAttribute('title', 'currently watching')
  })

  it('classed as .led for the design-system CSS branch', () => {
    render(<PhosphorLED status='backlog' label='in queue' />)
    const led = screen.getByRole('img', { name: 'in queue' })
    expect(led).toHaveClass('led')
  })
})
