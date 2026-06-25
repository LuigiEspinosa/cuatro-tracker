import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MediaType, WatchStatus } from '@prisma/client'
import { TimelineRow, formatTimelineDate, type TimelineRowItem } from '../TimelineRow'
import type { SortMode } from '@/lib/timeline'

function makeItem(overrides: Partial<TimelineRowItem> = {}): TimelineRowItem {
  return {
    id: 'entry-1',
    mediaItemId: 'media-1',
    mediaType: MediaType.MOVIE,
    status: WatchStatus.COMPLETED,
    title: 'Fight Club',
    posterPath: '/poster.jpg',
    year: 1999,
    release_date: new Date('1999-10-15T00:00:00.000Z'),
    completed_at: new Date('2026-05-01T00:00:00.000Z'),
    created_at: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
  }
}

function renderRow(
  item: TimelineRowItem,
  sortMode: SortMode = 'release_desc',
  index = 0,
) {
  return render(
    <ul>
      <TimelineRow item={item} sortMode={sortMode} index={index} />
    </ul>,
  )
}

describe('TimelineRow', () => {
  beforeEach(() => cleanup())

  it('renders the title and the <MEDIUM> · <year> meta line', () => {
    renderRow(makeItem())
    expect(screen.getByText('Fight Club')).toBeInTheDocument()
    expect(screen.getByText('MOVIE · 1999')).toBeInTheDocument()
  })

  it('drops the year from the meta line when year is null', () => {
    renderRow(makeItem({ year: null }))
    expect(screen.getByText('MOVIE')).toBeInTheDocument()
  })

  it('selects the per-medium FramedCover chrome via data-medium', () => {
    const { container } = renderRow(
      makeItem({ mediaType: MediaType.GAME, posterPath: 'https://images.igdb.com/x.jpg' }),
    )
    expect(container.querySelector('.fc')?.getAttribute('data-medium')).toBe('games')
  })

  it('maps the WatchStatus to the per-medium LED label (GAME speaks play)', () => {
    renderRow(
      makeItem({ mediaType: MediaType.GAME, status: WatchStatus.WATCHING, posterPath: null }),
    )
    expect(screen.getByRole('img', { name: 'PLAYING' })).toBeInTheDocument()
  })

  it('links to the GAME detail route /games/{id} (D12 fix)', () => {
    const { container } = renderRow(
      makeItem({ mediaType: MediaType.GAME, mediaItemId: 'game-9', posterPath: null }),
    )
    expect(container.querySelector('a.tl-row')?.getAttribute('href')).toBe('/games/game-9')
  })

  it('links movies to /movies/{id}', () => {
    const { container } = renderRow(makeItem({ mediaItemId: 'mv-7' }))
    expect(container.querySelector('a.tl-row')?.getAttribute('href')).toBe('/movies/mv-7')
  })

  it('shows the release_date in release_* sort', () => {
    renderRow(makeItem(), 'release_desc')
    expect(screen.getByText('1999-10-15')).toBeInTheDocument()
  })

  it('shows the completed_at date in consumed_* sort', () => {
    renderRow(makeItem(), 'consumed_desc')
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
  })

  it('shows the created_at date in added_asc sort', () => {
    renderRow(makeItem(), 'added_asc')
    expect(screen.getByText('2026-04-01')).toBeInTheDocument()
  })

  it('shows a dash for an unconsumed item under a consumed_* sort', () => {
    const { container } = renderRow(makeItem({ completed_at: null }), 'consumed_desc')
    const date = container.querySelector('.tl-date')
    expect(date?.textContent).toBe('-')
    expect(date?.classList.contains('is-null')).toBe(true)
  })

  it('renders the bitmap-? fallback (no FramedCover) when posterPath is null', () => {
    const { container } = renderRow(makeItem({ posterPath: null }))
    expect(container.querySelector('.tl-thumb-fallback')?.textContent).toBe('?')
    expect(container.querySelector('.fc')).toBeNull()
  })

  it('applies the alternating tint from the running index', () => {
    const { container } = renderRow(makeItem(), 'release_desc', 3)
    expect(container.querySelector('.tl-row')?.classList.contains('row-odd')).toBe(true)
  })

  it('imports no animation libraries (NFR26)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'components/organisms/TimelineRow/TimelineRow.tsx'),
      'utf8',
    )
    expect(src).not.toMatch(/from ['"](framer-motion|motion|gsap|@gsap\/react|lenis)/)
  })

  it('formatTimelineDate returns YYYY-MM-DD in UTC, or a dash for null', () => {
    expect(formatTimelineDate(new Date('2001-02-03T23:30:00Z'))).toBe('2001-02-03')
    expect(formatTimelineDate(null)).toBe('-')
  })
})

describe('TimelineRow franchise summary (Story 10.7)', () => {
  beforeEach(() => cleanup())

  function makeFranchise(childCount = 3): TimelineRowItem {
    const children = Array.from({ length: childCount }, (_unused, i) =>
      makeItem({
        id: `child-${i}`,
        mediaItemId: `media-${i}`,
        title: `Chapter ${i + 1}`,
        franchise_id: 'mcu',
      }),
    )
    return makeItem({
      id: 'franchise-anchor',
      title: 'mcu',
      franchise_id: 'mcu',
      entries: children,
    })
  }

  it('renders the FRANCHISE tag, the N ENTRIES chip, and a chevron on a button (AC-3)', () => {
    const { container } = renderRow(makeFranchise(3))
    expect(screen.getByText('FRANCHISE: mcu')).toBeInTheDocument()
    expect(screen.getByText('3 ENTRIES')).toBeInTheDocument()
    expect(container.querySelector('.tl-chevron')).not.toBeNull()
    // A synthetic franchise has no detail page: a <button>, never an <a>.
    expect(container.querySelector('[data-franchise-summary]')?.tagName).toBe('BUTTON')
    expect(container.querySelector('a.tl-row')).toBeNull()
  })

  it('renders no child rows until the chevron is clicked', () => {
    const { container } = renderRow(makeFranchise(3))
    expect(container.querySelectorAll('[data-franchise-child]')).toHaveLength(0)
  })

  it('expands to N child rows on click and collapses them out of the DOM (AC-3, AC-4)', () => {
    const { container } = renderRow(makeFranchise(3))
    const summary = screen.getByRole('button', { name: /mcu franchise/ })
    expect(summary.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(summary)
    expect(summary.getAttribute('aria-expanded')).toBe('true')
    expect(container.querySelectorAll('[data-franchise-child]')).toHaveLength(3)

    fireEvent.click(summary)
    expect(summary.getAttribute('aria-expanded')).toBe('false')
    // AC-4: children are removed from the DOM, not display:none hidden.
    expect(container.querySelectorAll('[data-franchise-child]')).toHaveLength(0)
  })

  it('renders the children in provided order, each linking to its detail page (D5)', () => {
    const { container } = renderRow(makeFranchise(3))
    fireEvent.click(screen.getByRole('button', { name: /mcu franchise/ }))
    const childTitles = Array.from(
      container.querySelectorAll('[data-franchise-child] .tl-title'),
    ).map((el) => el.textContent)
    expect(childTitles).toEqual(['Chapter 1', 'Chapter 2', 'Chapter 3'])
    expect(container.querySelectorAll('[data-franchise-child] a.tl-row')).toHaveLength(3)
  })
})
