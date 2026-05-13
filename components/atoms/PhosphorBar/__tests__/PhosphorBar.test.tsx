import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PhosphorBar } from '../PhosphorBar'

afterEach(() => {
  cleanup()
})

describe('PhosphorBar rendering (AC-2)', () => {
  it('renders with role=progressbar and the correct aria values', () => {
    render(<PhosphorBar value={50} max={100} label='episodes watched' />)
    const bar = screen.getByRole('progressbar', { name: 'episodes watched' })
    expect(bar).toHaveAttribute('aria-valuenow', '50')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('renders the filled portion at value/max percent', () => {
    render(<PhosphorBar value={25} max={100} label='progress' />)
    const fill = document.querySelector('.pb-fill') as HTMLElement
    expect(fill.style.width).toBe('25%')
  })

  it('label propagates to aria-label; title surfaces value / max', () => {
    render(<PhosphorBar value={3} max={12} label='chapters read' />)
    const bar = screen.getByRole('progressbar', { name: 'chapters read' })
    expect(bar).toHaveAttribute('aria-label', 'chapters read')
    expect(bar).toHaveAttribute('title', 'chapters read (3 / 12)')
  })

  it('clamps value < 0 to 0', () => {
    render(<PhosphorBar value={-10} max={100} label='progress' />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(bar).toHaveAttribute('title', 'progress (0 / 100)')
    const fill = document.querySelector('.pb-fill') as HTMLElement
    expect(fill.style.width).toBe('0%')
  })

  it('clamps value > max to max', () => {
    render(<PhosphorBar value={200} max={100} label='progress' />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    expect(bar).toHaveAttribute('title', 'progress (100 / 100)')
    const fill = document.querySelector('.pb-fill') as HTMLElement
    expect(fill.style.width).toBe('100%')
  })

  it('renders empty bar with (0 / 0) tooltip when max=0', () => {
    render(<PhosphorBar value={10} max={0} label='no data yet' />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '0')
    expect(bar).toHaveAttribute('title', 'no data yet (0 / 0)')
    const fill = document.querySelector('.pb-fill') as HTMLElement
    expect(fill.style.width).toBe('0%')
  })

  it('handles NaN value as 0 fill', () => {
    render(<PhosphorBar value={Number.NaN} max={100} label='progress' />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    const fill = document.querySelector('.pb-fill') as HTMLElement
    expect(fill.style.width).toBe('0%')
  })

  it('classed as .pb for the design-system CSS branch', () => {
    render(<PhosphorBar value={1} max={2} label='half' />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveClass('pb')
  })
})
