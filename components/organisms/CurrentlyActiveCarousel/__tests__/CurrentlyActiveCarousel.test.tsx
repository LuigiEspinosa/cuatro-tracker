import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MediaType, WatchStatus } from '@prisma/client'
import type { LibraryItem } from '@/lib/types/library'

const navigateMock = vi.fn()

vi.mock('@/components/molecules/ChannelFlipTransition', () => ({
  useChannelFlipNavigate: () => ({
    navigate: (target: string) => {
      navigateMock(target)
      return Promise.resolve()
    },
    overlay: null,
  }),
}))

import { CurrentlyActiveCarousel } from '../CurrentlyActiveCarousel'

const reducedMotionMatches = { value: false }

function makeMatchMedia(): typeof window.matchMedia {
  return (query: string) =>
    ({
      matches:
        query === '(prefers-reduced-motion: reduce)'
          ? reducedMotionMatches.value
          : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList
}

beforeEach(() => {
  navigateMock.mockReset()
  reducedMotionMatches.value = false
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: makeMatchMedia(),
  })
})

afterEach(() => {
  cleanup()
})

function fixtureItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'entry-1',
    mediaItemId: 'media-1',
    mediaType: MediaType.MOVIE,
    status: WatchStatus.WATCHING,
    title: 'Fight Club',
    posterPath: '/poster.jpg',
    year: 1999,
    releaseDate: '1999-10-15T00:00:00.000Z',
    progressLabel: 'WATCHING',
    progressPct: 0,
    sourceLabel: 'From TMDB',
    createdAt: '2026-05-10T12:00:00.000Z',
    updatedAt: '2026-05-12T12:00:00.000Z',
    ...overrides,
  }
}

describe('CurrentlyActiveCarousel', () => {
  it('renders the empty state when items is empty', () => {
    render(<CurrentlyActiveCarousel items={[]} />)
    expect(screen.getByText('> LIBRARY EMPTY')).toBeInTheDocument()
    expect(screen.getByText('ADD AN ITEM TO BEGIN')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '> ADD' })).toBeInTheDocument()
  })

  it('calls navigate("/search") when the empty-state CTA is clicked', () => {
    render(<CurrentlyActiveCarousel items={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '> ADD' }))
    expect(navigateMock).toHaveBeenCalledWith('/search')
  })

  it('renders the active item title, eyebrow, and progress label', () => {
    render(<CurrentlyActiveCarousel items={[fixtureItem({ progressLabel: '42% WATCHED' })]} />)
    expect(screen.getByRole('heading', { name: 'Fight Club' })).toBeInTheDocument()
    expect(screen.getByText('MOVIE · NOW WATCHING')).toBeInTheDocument()
    expect(screen.getByText('42% WATCHED')).toBeInTheDocument()
  })

  it('renders one dot per item with the active dot marked aria-selected', () => {
    const items = [
      fixtureItem({ id: 'a', title: 'A' }),
      fixtureItem({ id: 'b', title: 'B' }),
      fixtureItem({ id: 'c', title: 'C' }),
    ]
    render(<CurrentlyActiveCarousel items={items} />)
    const dots = screen.getAllByRole('tab')
    expect(dots).toHaveLength(3)
    expect(dots[0]).toHaveAttribute('aria-selected', 'true')
    expect(dots[1]).toHaveAttribute('aria-selected', 'false')
  })

  it('advances activeIdx after rotationMs (real timers, short rotation)', async () => {
    vi.useFakeTimers()
    try {
      const items = [
        fixtureItem({ id: 'a', title: 'AlphaTitle' }),
        fixtureItem({ id: 'b', title: 'BetaTitle' }),
      ]
      render(<CurrentlyActiveCarousel items={items} rotationMs={100} />)
      expect(screen.getByRole('heading', { name: 'AlphaTitle' })).toBeInTheDocument()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150)
      })
      expect(screen.getByRole('heading', { name: 'BetaTitle' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('pauses auto-cycle on pointerEnter and resumes on pointerLeave', async () => {
    vi.useFakeTimers()
    try {
      const items = [
        fixtureItem({ id: 'a', title: 'AlphaTitle' }),
        fixtureItem({ id: 'b', title: 'BetaTitle' }),
      ]
      const { container } = render(
        <CurrentlyActiveCarousel items={items} rotationMs={100} />,
      )
      const screenEl = container.querySelector('.cac-screen') as HTMLElement
      expect(screenEl).not.toBeNull()
      fireEvent.pointerEnter(screenEl)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300)
      })
      // Paused: still on item a.
      expect(screen.getByRole('heading', { name: 'AlphaTitle' })).toBeInTheDocument()
      fireEvent.pointerLeave(screenEl)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150)
      })
      expect(screen.getByRole('heading', { name: 'BetaTitle' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does NOT auto-cycle when prefers-reduced-motion matches', async () => {
    reducedMotionMatches.value = true
    vi.useFakeTimers()
    try {
      const items = [
        fixtureItem({ id: 'a', title: 'AlphaTitle' }),
        fixtureItem({ id: 'b', title: 'BetaTitle' }),
      ]
      render(<CurrentlyActiveCarousel items={items} rotationMs={100} />)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500)
      })
      // No advance.
      expect(screen.getByRole('heading', { name: 'AlphaTitle' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clicking a dot sets the active index to that item', () => {
    const items = [
      fixtureItem({ id: 'a', title: 'AlphaTitle' }),
      fixtureItem({ id: 'b', title: 'BetaTitle' }),
      fixtureItem({ id: 'c', title: 'CharlieTitle' }),
    ]
    render(<CurrentlyActiveCarousel items={items} />)
    const dots = screen.getAllByRole('tab')
    fireEvent.click(dots[2])
    expect(screen.getByRole('heading', { name: 'CharlieTitle' })).toBeInTheDocument()
  })

  it('arrow keys on the dot-row advance the active index manually', () => {
    const items = [
      fixtureItem({ id: 'a', title: 'AlphaTitle' }),
      fixtureItem({ id: 'b', title: 'BetaTitle' }),
    ]
    const { container } = render(<CurrentlyActiveCarousel items={items} />)
    const tablist = container.querySelector('[role="tablist"]') as HTMLElement
    fireEvent.keyDown(tablist, { key: 'ArrowRight' })
    expect(screen.getByRole('heading', { name: 'BetaTitle' })).toBeInTheDocument()
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' })
    expect(screen.getByRole('heading', { name: 'AlphaTitle' })).toBeInTheDocument()
  })
})
