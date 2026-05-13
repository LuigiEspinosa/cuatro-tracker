import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readInitialReducedMotion, useReducedMotion } from '../useReducedMotion'

type MediaListener = (e: MediaQueryListEvent) => void

function buildMatchMedia(initial: boolean) {
  let listener: MediaListener | null = null
  const mql = {
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_event: string, l: MediaListener) => {
      listener = l
    }),
    removeEventListener: vi.fn(() => {
      listener = null
    }),
    dispatchEvent: vi.fn(() => false),
  }
  const flip = (next: boolean) => {
    mql.matches = next
    if (listener) listener({ matches: next } as MediaQueryListEvent)
  }
  const factory = vi.fn(() => mql)
  return { mql, factory, flip }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readInitialReducedMotion', () => {
  it('returns the override when boolean true', () => {
    expect(readInitialReducedMotion(true)).toBe(true)
  })

  it('returns the override when boolean false (even if matchMedia says true)', () => {
    const { factory } = buildMatchMedia(true)
    vi.stubGlobal('matchMedia', factory)
    expect(readInitialReducedMotion(false)).toBe(false)
  })

  it('reads matchMedia when override is undefined', () => {
    const { factory } = buildMatchMedia(true)
    vi.stubGlobal('matchMedia', factory)
    expect(readInitialReducedMotion()).toBe(true)
  })
})

describe('useReducedMotion', () => {
  it('mirrors the override when provided', () => {
    const { result, rerender } = renderHook(({ override }: { override?: boolean }) => useReducedMotion(override), {
      initialProps: { override: true },
    })
    expect(result.current).toBe(true)
    rerender({ override: false })
    expect(result.current).toBe(false)
  })

  it('reflects matchMedia change events when override is undefined', () => {
    const { factory, flip } = buildMatchMedia(false)
    vi.stubGlobal('matchMedia', factory)
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
    act(() => {
      flip(true)
    })
    expect(result.current).toBe(true)
  })

  it('cleans up the change listener on unmount', () => {
    const { factory, mql } = buildMatchMedia(true)
    vi.stubGlobal('matchMedia', factory)
    const { unmount } = renderHook(() => useReducedMotion())
    unmount()
    expect(mql.removeEventListener).toHaveBeenCalledTimes(1)
  })
})
