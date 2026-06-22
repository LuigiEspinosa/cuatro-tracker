import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TimelineFilterStrip } from '../TimelineFilterStrip'
import { useTimelineStore } from '@/store/timeline'

beforeEach(() => {
  cleanup()
  useTimelineStore.getState().reset()
})

function mediaGroup() {
  return screen.getByRole('group', { name: 'Filter by media type' })
}

function statusGroup() {
  return screen.getByRole('group', { name: 'Filter by watch status' })
}

function sortGroup() {
  return screen.getByRole('radiogroup', { name: 'Sort timeline' })
}

describe('TimelineFilterStrip', () => {
  it('renders the five control groups plus RESET', () => {
    render(<TimelineFilterStrip />)
    expect(mediaGroup()).toBeInTheDocument()
    expect(statusGroup()).toBeInTheDocument()
    expect(sortGroup()).toBeInTheDocument()
    expect(within(mediaGroup()).getAllByRole('button')).toHaveLength(5)
    expect(within(statusGroup()).getAllByRole('button')).toHaveLength(5)
    expect(within(sortGroup()).getAllByRole('radio')).toHaveLength(5)
    expect(screen.getByRole('button', { name: /FRANCHISE/ })).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /RESET/ })).toBeInTheDocument()
  })

  it('toggling a media chip updates the store and flips aria-pressed', () => {
    render(<TimelineFilterStrip />)
    const movies = within(mediaGroup()).getByRole('button', { name: /MOVIES/ })
    expect(movies.getAttribute('aria-pressed')).toBe('true')
    expect(useTimelineStore.getState().mediaTypes.has('MOVIE')).toBe(true)

    fireEvent.click(movies)
    expect(useTimelineStore.getState().mediaTypes.has('MOVIE')).toBe(false)
    expect(movies.getAttribute('aria-pressed')).toBe('false')
  })

  it('toggling a status chip updates the store and flips aria-pressed', () => {
    render(<TimelineFilterStrip />)
    const watching = within(statusGroup()).getByRole('button', { name: /WATCHING/ })
    expect(watching.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(watching)
    expect(useTimelineStore.getState().statuses.has('WATCHING')).toBe(false)
    expect(watching.getAttribute('aria-pressed')).toBe('false')
  })

  it('does not let the last active media chip toggle off (D10 guard)', () => {
    useTimelineStore.getState().hydrateFromParams(new URLSearchParams('types=movie'))
    render(<TimelineFilterStrip />)
    const movies = within(mediaGroup()).getByRole('button', { name: /MOVIES/ })
    expect(useTimelineStore.getState().mediaTypes.size).toBe(1)
    expect(movies.getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(movies)
    // The guard no-ops: the single active type stays on.
    expect(useTimelineStore.getState().mediaTypes.size).toBe(1)
    expect(useTimelineStore.getState().mediaTypes.has('MOVIE')).toBe(true)
    expect(movies.getAttribute('aria-pressed')).toBe('true')
  })

  it('does not let the last active status chip toggle off (D10 guard)', () => {
    useTimelineStore
      .getState()
      .hydrateFromParams(new URLSearchParams('statuses=completed'))
    render(<TimelineFilterStrip />)
    const completed = within(statusGroup()).getByRole('button', { name: /COMPLETED/ })
    expect(useTimelineStore.getState().statuses.size).toBe(1)

    fireEvent.click(completed)
    expect(useTimelineStore.getState().statuses.size).toBe(1)
    expect(useTimelineStore.getState().statuses.has('COMPLETED')).toBe(true)
  })

  it('selecting a sort radio updates the mode and moves the active marker', () => {
    render(<TimelineFilterStrip />)
    const radios = within(sortGroup()).getAllByRole('radio')
    // DOM order: release_desc, release_asc, consumed_desc, consumed_asc, added_asc.
    expect(radios[0].getAttribute('aria-checked')).toBe('true')
    expect(radios[0].getAttribute('data-active')).toBe('true')

    fireEvent.click(radios[3])
    expect(useTimelineStore.getState().sortMode).toBe('consumed_asc')
    expect(radios[3].getAttribute('aria-checked')).toBe('true')
    expect(radios[3].getAttribute('data-active')).toBe('true')
    expect(radios[0].getAttribute('aria-checked')).toBe('false')
    expect(radios[0].getAttribute('data-active')).toBe('false')
  })

  it('the franchise toggle flips franchiseMode and aria-pressed', () => {
    render(<TimelineFilterStrip />)
    const franchise = screen.getByRole('button', { name: /FRANCHISE/ })
    expect(franchise.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(franchise)
    expect(useTimelineStore.getState().franchiseMode).toBe(true)
    expect(franchise.getAttribute('aria-pressed')).toBe('true')
  })

  it('typing in search updates titleQuery after the 200ms debounce', () => {
    vi.useFakeTimers()
    try {
      render(<TimelineFilterStrip />)
      const input = screen.getByRole('searchbox') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'matrix' } })

      // Untouched before the debounce window elapses.
      expect(useTimelineStore.getState().titleQuery).toBe('')
      act(() => {
        vi.advanceTimersByTime(199)
      })
      expect(useTimelineStore.getState().titleQuery).toBe('')
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(useTimelineStore.getState().titleQuery).toBe('matrix')
    } finally {
      vi.useRealTimers()
    }
  })

  it('RESET restores every control to its default', () => {
    useTimelineStore
      .getState()
      .hydrateFromParams(
        new URLSearchParams(
          'sort=added_asc&types=movie&statuses=completed&franchise=1&q=matrix',
        ),
      )
    render(<TimelineFilterStrip />)
    expect(useTimelineStore.getState().sortMode).toBe('added_asc')

    fireEvent.click(screen.getByRole('button', { name: /RESET/ }))
    const state = useTimelineStore.getState()
    expect(state.sortMode).toBe('release_desc')
    expect(state.mediaTypes.size).toBe(6)
    expect(state.statuses.size).toBe(5)
    expect(state.franchiseMode).toBe(false)
    expect(state.titleQuery).toBe('')
  })

  it('disabled greys the strip and disables every control', () => {
    const { container } = render(<TimelineFilterStrip disabled />)
    expect(container.querySelector('.tl-strip')?.getAttribute('data-disabled')).toBe(
      'true',
    )
    const chip = within(mediaGroup()).getAllByRole('button')[0] as HTMLButtonElement
    expect(chip.disabled).toBe(true)
    const radio = within(sortGroup()).getAllByRole('radio')[0] as HTMLButtonElement
    expect(radio.disabled).toBe(true)
    expect((screen.getByRole('button', { name: /FRANCHISE/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect((screen.getByRole('button', { name: /RESET/ }) as HTMLButtonElement).disabled).toBe(
      true,
    )
    expect((screen.getByRole('searchbox') as HTMLInputElement).disabled).toBe(true)
  })

  it('roving arrow focus moves within a chip group and Enter toggles the focused chip', async () => {
    const user = userEvent.setup()
    render(<TimelineFilterStrip />)
    const chips = within(mediaGroup()).getAllByRole('button')
    expect(chips[0].getAttribute('tabindex')).toBe('0')
    expect(chips[1].getAttribute('tabindex')).toBe('-1')

    chips[0].focus()
    expect(chips[0]).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(chips[1]).toHaveFocus()
    expect(chips[1].getAttribute('tabindex')).toBe('0')
    expect(chips[0].getAttribute('tabindex')).toBe('-1')

    // TV is the second chip; Enter toggles it off (six active types, not the last).
    expect(useTimelineStore.getState().mediaTypes.has('TV_SHOW')).toBe(true)
    await user.keyboard('{Enter}')
    expect(useTimelineStore.getState().mediaTypes.has('TV_SHOW')).toBe(false)
    expect(chips[1].getAttribute('aria-pressed')).toBe('false')
  })

  it('roving focus follows a mouse click so the next arrow continues from there', async () => {
    const user = userEvent.setup()
    render(<TimelineFilterStrip />)
    const chips = within(mediaGroup()).getAllByRole('button')

    // Click the third chip: focus and the roving tab stop move to it.
    await user.click(chips[2])
    expect(chips[2]).toHaveFocus()
    expect(chips[2].getAttribute('tabindex')).toBe('0')

    // ArrowRight continues from the clicked chip, not the stale initial index 0.
    await user.keyboard('{ArrowRight}')
    expect(chips[3]).toHaveFocus()
    expect(chips[3].getAttribute('tabindex')).toBe('0')
    expect(chips[2].getAttribute('tabindex')).toBe('-1')
  })

  it('Home and End move focus to the first and last sort option', async () => {
    const user = userEvent.setup()
    render(<TimelineFilterStrip />)
    const radios = within(sortGroup()).getAllByRole('radio')

    radios[0].focus()
    expect(radios[0]).toHaveFocus()

    await user.keyboard('{End}')
    expect(radios[radios.length - 1]).toHaveFocus()

    await user.keyboard('{Home}')
    expect(radios[0]).toHaveFocus()
  })

  it('focuses search on the F / / shortcut and resets on Escape only from outside the strip', () => {
    useTimelineStore.getState().setFranchiseMode(true)
    render(<TimelineFilterStrip />)
    const input = screen.getByRole('searchbox')
    expect(input).not.toHaveFocus()

    // F (pressed outside any field) focuses the search input.
    fireEvent.keyDown(document.body, { key: 'f' })
    expect(input).toHaveFocus()

    // Escape while focus is in the field must NOT reset the strip (SearchInput
    // owns the in-field clear), so franchiseMode stays on.
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(useTimelineStore.getState().franchiseMode).toBe(true)

    // Escape on a control INSIDE the strip must NOT reset either (review option
    // c): the destructive reset fires only from outside the strip, so a focused
    // chip, radio, or the franchise toggle does not wipe every filter.
    fireEvent.keyDown(screen.getByRole('button', { name: /FRANCHISE/ }), {
      key: 'Escape',
    })
    expect(useTimelineStore.getState().franchiseMode).toBe(true)

    // Escape from outside the strip (a focused timeline row, nav link, or the
    // page body) resets the whole strip.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(useTimelineStore.getState().franchiseMode).toBe(false)
  })

  it('imports no animation libraries (NFR26)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'components/organisms/TimelineFilterStrip/TimelineFilterStrip.tsx'),
      'utf8',
    )
    expect(src).not.toMatch(/from ['"](framer-motion|motion|gsap|@gsap\/react|lenis)/)
  })
})
