import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MediaType, WatchStatus } from '@prisma/client'
import type { LibraryItem } from '@/lib/types/library'

// Control the router + deep-link URL the URL-sync hook hydrates from.
const nav = vi.hoisted(() => ({
  params: new URLSearchParams(''),
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => nav.params,
}))

// The year band owns GSAP; stub it to the year it is told to show. The row has
// its own suite; stub it to its title so grouping/filtering is easy to assert.
vi.mock('@/components/molecules/StickyYearBand', () => ({
  StickyYearBand: ({ year }: { year: number }) => (
    <div data-testid='year-band'>{String(year)}</div>
  ),
}))

vi.mock('@/components/organisms/TimelineRow', () => ({
  TimelineRow: ({ item }: { item: { title: string } }) => (
    <li data-testid='tl-row'>{item.title}</li>
  ),
}))

// The strip has its own suite; stub it so its store subscription and controls
// do not muddy the view's grouping/empty-state assertions. It still records the
// disabled flag the view passes (empty library -> disabled).
vi.mock('@/components/organisms/TimelineFilterStrip', () => ({
  TimelineFilterStrip: ({ disabled }: { disabled?: boolean }) => (
    <div data-testid='filter-strip' data-disabled={disabled ? 'true' : 'false'} />
  ),
}))

import { TimelineView } from '../TimelineView'
import { useTimelineStore } from '@/store/timeline'

function libItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'x',
    mediaItemId: 'm-1',
    mediaType: MediaType.MOVIE,
    status: WatchStatus.COMPLETED,
    title: 'Untitled',
    originalTitle: null,
    posterPath: null,
    year: 2000,
    releaseDate: '2000-01-01T00:00:00.000Z',
    progressLabel: null,
    progressPct: null,
    sourceLabel: null,
    tmdbId: null,
    anilistId: null,
    igdbId: null,
    steamId: null,
    achievementSyncStatus: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    completedAt: null,
    ...overrides,
  }
}

const MIXED: LibraryItem[] = [
  libItem({ id: 'a', mediaType: MediaType.MOVIE, title: 'Movie 1999', year: 1999, releaseDate: '1999-10-15T00:00:00.000Z' }),
  libItem({ id: 'b', mediaType: MediaType.GAME, title: 'Game 2007', year: 2007, releaseDate: '2007-01-20T00:00:00.000Z' }),
  libItem({ id: 'c', mediaType: MediaType.MOVIE, title: 'Movie 2007', year: 2007, releaseDate: '2007-06-10T00:00:00.000Z' }),
  libItem({ id: 'd', mediaType: MediaType.TV_SHOW, title: 'TV 2020', year: 2020, releaseDate: '2020-03-03T00:00:00.000Z' }),
]

beforeEach(() => {
  cleanup()
  nav.push.mockReset()
  nav.params = new URLSearchParams('')
  useTimelineStore.getState().reset()
})

describe('TimelineView', () => {
  it('renders one row per in-scope entry (defaults: all types, release_desc)', () => {
    render(<TimelineView initialItems={MIXED} />)
    expect(screen.getAllByTestId('tl-row')).toHaveLength(4)
  })

  it('groups by year in release-descending order', () => {
    const { container } = render(<TimelineView initialItems={MIXED} />)
    const years = Array.from(container.querySelectorAll('[data-tl-year]')).map((el) =>
      el.getAttribute('data-tl-year'),
    )
    expect(years).toEqual(['2020', '2007', '1999'])
  })

  it('renders the rows within a year group in sorted order', () => {
    render(<TimelineView initialItems={MIXED} />)
    const titles = screen.getAllByTestId('tl-row').map((el) => el.textContent)
    expect(titles).toEqual(['TV 2020', 'Movie 2007', 'Game 2007', 'Movie 1999'])
  })

  it('filters by the mediaTypes hydrated from the URL', () => {
    nav.params = new URLSearchParams('types=movie')
    render(<TimelineView initialItems={MIXED} />)
    const titles = screen.getAllByTestId('tl-row').map((el) => el.textContent)
    expect(titles).toEqual(['Movie 2007', 'Movie 1999'])
  })

  it('shows the empty state (no rows, no band) for an empty library', () => {
    render(<TimelineView initialItems={[]} />)
    expect(screen.getByRole('button', { name: /ADD AN ITEM/ })).toBeInTheDocument()
    expect(screen.queryByTestId('tl-row')).toBeNull()
    expect(screen.queryByTestId('year-band')).toBeNull()
  })

  it('shows NO MATCHES (not the LIBRARY EMPTY card) when filters exclude every item (D8)', () => {
    nav.params = new URLSearchParams('types=manga')
    render(<TimelineView initialItems={MIXED} />)
    expect(screen.getByText('NO MATCHES')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /ADD AN ITEM/ })).toBeNull()
    expect(screen.queryByTestId('tl-row')).toBeNull()
    // The strip stays active (not disabled) so RESET remains reachable.
    expect(screen.getByTestId('filter-strip').getAttribute('data-disabled')).toBe('false')
  })

  it('filters by the title query hydrated from the URL, after sort + group (AC-4)', () => {
    nav.params = new URLSearchParams('q=2007')
    render(<TimelineView initialItems={MIXED} />)
    const titles = screen.getAllByTestId('tl-row').map((el) => el.textContent)
    // Both 2007 titles survive, in release-desc order (June before January).
    expect(titles).toEqual(['Movie 2007', 'Game 2007'])
  })

  it('matches the original title as well as the display title (AC-4)', () => {
    const items: LibraryItem[] = [
      libItem({
        id: 'z',
        title: 'Spirited Away',
        originalTitle: 'Sen to Chihiro',
        year: 2001,
        releaseDate: '2001-07-20T00:00:00.000Z',
      }),
      libItem({
        id: 'y',
        title: 'Other Film',
        originalTitle: null,
        year: 2001,
        releaseDate: '2001-01-01T00:00:00.000Z',
      }),
    ]
    nav.params = new URLSearchParams('q=chihiro')
    render(<TimelineView initialItems={items} />)
    const titles = screen.getAllByTestId('tl-row').map((el) => el.textContent)
    expect(titles).toEqual(['Spirited Away'])
  })

  it('marks the strip disabled for a truly empty library', () => {
    render(<TimelineView initialItems={[]} />)
    expect(screen.getByTestId('filter-strip').getAttribute('data-disabled')).toBe('true')
  })

  it('navigates to /search from the empty-state CTA', () => {
    render(<TimelineView initialItems={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /ADD AN ITEM/ }))
    expect(nav.push).toHaveBeenCalledWith('/search')
  })
})
