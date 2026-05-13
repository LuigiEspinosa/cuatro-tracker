import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BootSequence } from '../BootSequence'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderBoot(props: Partial<Parameters<typeof BootSequence>[0]> = {}) {
  const onComplete = props.onComplete ?? vi.fn()
  const utils = render(
    <BootSequence onComplete={onComplete} showWelcome={props.showWelcome} totalDuration={props.totalDuration} reducedMotionOverride={props.reducedMotionOverride} />
  )
  return { onComplete, ...utils }
}

describe('BootSequence rendering (non-reduced)', () => {
  it('renders the boot container with role=status', () => {
    renderBoot({ reducedMotionOverride: false })
    const container = screen.getByRole('status', { name: /system boot sequence/i })
    expect(container).toBeInTheDocument()
    expect(container).toHaveClass('bs')
  })

  it('starts at frame 1 (power-on; no header yet)', () => {
    renderBoot({ reducedMotionOverride: false })
    const container = screen.getByRole('status')
    expect(container).toHaveAttribute('data-frame', '1')
    expect(screen.queryByText('CUATRO TRACKER')).not.toBeInTheDocument()
  })
})

describe('BootSequence reduced-motion branch (AC-2)', () => {
  it('renders the static READY. frame and never the welcome line', () => {
    renderBoot({ reducedMotionOverride: true })
    expect(screen.getByText('CUATRO TRACKER')).toBeInTheDocument()
    expect(screen.getByText('VERSION 0.2.0')).toBeInTheDocument()
    expect(screen.getByText('READY.')).toBeInTheDocument()
    expect(screen.queryByText('> WELCOME, CUATRO')).not.toBeInTheDocument()
  })

  it('renders data-frame=9 (final non-welcome frame)', () => {
    renderBoot({ reducedMotionOverride: true })
    expect(screen.getByRole('status')).toHaveAttribute('data-frame', '9')
  })

  it('calls onComplete within one requestAnimationFrame tick', async () => {
    const onComplete = vi.fn()
    renderBoot({ reducedMotionOverride: true, onComplete })
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('renders a fully-filled progress bar (20 cells)', () => {
    renderBoot({ reducedMotionOverride: true })
    const progress = screen.getByText(/^\[█{20}\]$/)
    expect(progress).toBeInTheDocument()
  })
})

describe('BootSequence keyboard skip (AC-3)', () => {
  it('completes the boot and calls onComplete when any key is pressed', async () => {
    const onComplete = vi.fn()
    renderBoot({ reducedMotionOverride: false, onComplete })
    expect(onComplete).not.toHaveBeenCalled()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('jumps to the final frame on key press (frame 10 with welcome)', async () => {
    renderBoot({ reducedMotionOverride: false, showWelcome: true })
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Space' }))
    })
    expect(screen.getByRole('status')).toHaveAttribute('data-frame', '10')
    expect(screen.getByText('> WELCOME, CUATRO')).toBeInTheDocument()
  })

  it('jumps to frame 9 on key press when showWelcome is false', async () => {
    renderBoot({ reducedMotionOverride: false, showWelcome: false })
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(screen.getByRole('status')).toHaveAttribute('data-frame', '9')
    expect(screen.queryByText('> WELCOME, CUATRO')).not.toBeInTheDocument()
  })
})

describe('BootSequence cleanup on unmount (AC-4)', () => {
  it('does not call onComplete after the component unmounts mid-animation', async () => {
    const onComplete = vi.fn()
    const { unmount } = renderBoot({ reducedMotionOverride: false, onComplete })
    expect(onComplete).not.toHaveBeenCalled()
    unmount()
    await new Promise((resolve) => setTimeout(resolve, 1300))
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('removes the keydown listener after unmount', async () => {
    const onComplete = vi.fn()
    const { unmount } = renderBoot({ reducedMotionOverride: false, onComplete })
    unmount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe('BootSequence onComplete fires once (AC-1)', () => {
  it('only fires onComplete once even if multiple key presses queue up', async () => {
    const onComplete = vi.fn()
    renderBoot({ reducedMotionOverride: false, onComplete })
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'c' }))
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })
})
