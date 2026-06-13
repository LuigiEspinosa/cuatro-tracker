import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, cleanup } from '@testing-library/react'
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
