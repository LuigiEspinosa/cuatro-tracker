import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StickyYearBand } from '../StickyYearBand'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('StickyYearBand rendering (AC-1)', () => {
  it('renders the year, no month band by default, and the 6-band rainbow rule', () => {
    render(<StickyYearBand year={1985} reducedMotionOverride={true} />)
    const banner = screen.getByRole('banner')
    expect(banner).toHaveClass('syb')

    expect(within(banner).getByText('1985')).toBeInTheDocument()

    const months = within(banner).queryAllByText(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/)
    expect(months).toHaveLength(0)

    const bands = banner.querySelectorAll('.syb-rule-band')
    expect(bands).toHaveLength(6)
  })

  it('renders the small-caps month abbreviation when month is 1-12', () => {
    render(<StickyYearBand year={1990} month={3} reducedMotionOverride={true} />)
    expect(screen.getByText('MAR')).toBeInTheDocument()
  })

  it('omits the month band for out-of-range, NaN, Infinity, or non-integer month values', () => {
    const cases: (number | undefined)[] = [0, 13, -1, NaN, Infinity, -Infinity, 3.5]
    for (const m of cases) {
      cleanup()
      render(<StickyYearBand year={1990} month={m} reducedMotionOverride={true} />)
      expect(screen.queryByText(/^[A-Z]{3}$/)).not.toBeInTheDocument()
    }
  })

  it('renders JAN and DEC at the inclusive boundaries', () => {
    const { rerender } = render(<StickyYearBand year={1990} month={1} reducedMotionOverride={true} />)
    expect(screen.getByText('JAN')).toBeInTheDocument()
    rerender(<StickyYearBand year={1990} month={12} reducedMotionOverride={true} />)
    expect(screen.getByText('DEC')).toBeInTheDocument()
  })

  it('honors the size prop on the year font-size inline style', () => {
    render(<StickyYearBand year={2000} size={96} reducedMotionOverride={true} />)
    const incoming = document.querySelector('[data-syb-layer="incoming"]') as HTMLElement
    expect(incoming).not.toBeNull()
    expect(incoming.style.fontSize).toBe('96px')
  })
})

describe('StickyYearBand reduced-motion branch (AC-3)', () => {
  it('does not mount an outgoing layer on year change when reduced', () => {
    const { rerender } = render(
      <StickyYearBand year={1985} reducedMotionOverride={true} />,
    )
    expect(screen.getByText('1985')).toBeInTheDocument()
    expect(document.querySelector('[data-syb-layer="outgoing"]')).toBeNull()

    rerender(<StickyYearBand year={1986} reducedMotionOverride={true} />)
    expect(screen.getByText('1986')).toBeInTheDocument()
    expect(screen.queryByText('1985')).not.toBeInTheDocument()
    expect(document.querySelector('[data-syb-layer="outgoing"]')).toBeNull()
  })
})

describe('StickyYearBand cross-fade (AC-2)', () => {
  it('mounts both outgoing and incoming layers right after the year prop changes', () => {
    const { rerender } = render(
      <StickyYearBand year={1985} reducedMotionOverride={false} fadeDurationMs={5000} />,
    )
    expect(document.querySelector('[data-syb-layer="outgoing"]')).toBeNull()

    rerender(<StickyYearBand year={1986} reducedMotionOverride={false} fadeDurationMs={5000} />)

    const outgoing = document.querySelector('[data-syb-layer="outgoing"]')
    const incoming = document.querySelector('[data-syb-layer="incoming"]')
    expect(outgoing).not.toBeNull()
    expect(incoming).not.toBeNull()
    expect(outgoing?.textContent).toBe('1985')
    expect(incoming?.textContent).toBe('1986')
  })
})

describe('StickyYearBand cleanup (AC-4)', () => {
  it('does not throw on mid-animation unmount and clears the outgoing layer from the DOM', async () => {
    const { rerender, unmount, container } = render(
      <StickyYearBand year={1985} reducedMotionOverride={false} fadeDurationMs={5000} />,
    )
    rerender(<StickyYearBand year={1986} reducedMotionOverride={false} fadeDurationMs={5000} />)
    expect(container.querySelector('[data-syb-layer="outgoing"]')).not.toBeNull()
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })
    expect(() => unmount()).not.toThrow()
    expect(container.querySelector('[data-syb-layer="outgoing"]')).toBeNull()
  })
})

describe('StickyYearBand prop guard (EH-1)', () => {
  it('does not re-render infinitely when year is NaN', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => render(<StickyYearBand year={Number.NaN} reducedMotionOverride={true} />)).not.toThrow()
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe('StickyYearBand rapid changes (EH-2, EH-3)', () => {
  it('refreshes the outgoing layer when a new year arrives mid-fade', () => {
    const { rerender } = render(
      <StickyYearBand year={1985} reducedMotionOverride={false} fadeDurationMs={5000} />,
    )
    rerender(<StickyYearBand year={1986} reducedMotionOverride={false} fadeDurationMs={5000} />)
    expect(document.querySelector('[data-syb-layer="outgoing"]')?.textContent).toBe('1985')
    rerender(<StickyYearBand year={1987} reducedMotionOverride={false} fadeDurationMs={5000} />)
    expect(document.querySelector('[data-syb-layer="outgoing"]')?.textContent).toBe('1986')
    expect(document.querySelector('[data-syb-layer="incoming"]')?.textContent).toBe('1987')
  })

  it('snaps the swap when year flips back to the outgoing year mid-fade', () => {
    const { rerender } = render(
      <StickyYearBand year={1985} reducedMotionOverride={false} fadeDurationMs={5000} />,
    )
    rerender(<StickyYearBand year={1986} reducedMotionOverride={false} fadeDurationMs={5000} />)
    expect(document.querySelector('[data-syb-layer="outgoing"]')?.textContent).toBe('1985')
    rerender(<StickyYearBand year={1985} reducedMotionOverride={false} fadeDurationMs={5000} />)
    expect(document.querySelector('[data-syb-layer="outgoing"]')).toBeNull()
    expect(document.querySelector('[data-syb-layer="incoming"]')?.textContent).toBe('1985')
  })
})
