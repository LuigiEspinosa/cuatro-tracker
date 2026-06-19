import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EraGroundTint } from '../EraGroundTint'

// containerRef is only read on the smooth path (skipped under reduced motion and
// short-circuited when current is null), so a static null ref suffices here. The
// smooth ScrollTrigger ramp needs real scroll geometry and is covered by the
// gated e2e plus the manual browser smoke, not jsdom.
const nullRef: { readonly current: HTMLElement | null } = { current: null }

function groundBase(): string {
  return document.documentElement.style.getPropertyValue('--ground-base')
}

afterEach(() => {
  cleanup()
  document.documentElement.style.removeProperty('--ground-base')
})

describe('EraGroundTint reduced motion (AC-4, D6)', () => {
  it('hard-jumps --ground-base to the active year era token', () => {
    render(
      <EraGroundTint
        groups={[{ year: 1985 }]}
        activeYear={1985}
        containerRef={nullRef}
        reducedMotionOverride={true}
      />,
    )
    expect(groundBase()).toBe('var(--ground-1980s)')
  })

  it('re-jumps when the active year crosses into a new era', () => {
    const { rerender } = render(
      <EraGroundTint
        groups={[{ year: 1999 }]}
        activeYear={1999}
        containerRef={nullRef}
        reducedMotionOverride={true}
      />,
    )
    expect(groundBase()).toBe('var(--ground-1990s)')
    rerender(
      <EraGroundTint
        groups={[{ year: 2000 }]}
        activeYear={2000}
        containerRef={nullRef}
        reducedMotionOverride={true}
      />,
    )
    expect(groundBase()).toBe('var(--ground-2000s)')
  })

  it('falls back to the flat base for an undated active group (D9)', () => {
    render(
      <EraGroundTint
        groups={[{ year: null }]}
        activeYear={null}
        containerRef={nullRef}
        reducedMotionOverride={true}
      />,
    )
    expect(groundBase()).toBe('')
  })
})

describe('EraGroundTint mount and cleanup', () => {
  it('renders null', () => {
    const { container } = render(
      <EraGroundTint
        groups={[{ year: 2005 }]}
        activeYear={2005}
        containerRef={nullRef}
        reducedMotionOverride={true}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('mounts the smooth path (registers ScrollTrigger) without crashing', () => {
    expect(() =>
      render(
        <EraGroundTint
          groups={[{ year: 1989 }, { year: 1990 }]}
          activeYear={1990}
          containerRef={nullRef}
          reducedMotionOverride={false}
        />,
      ),
    ).not.toThrow()
  })

  it('clears the --ground-base override on unmount', () => {
    const { unmount } = render(
      <EraGroundTint
        groups={[{ year: 1985 }]}
        activeYear={1985}
        containerRef={nullRef}
        reducedMotionOverride={true}
      />,
    )
    expect(groundBase()).toBe('var(--ground-1980s)')
    unmount()
    expect(groundBase()).toBe('')
  })
})
