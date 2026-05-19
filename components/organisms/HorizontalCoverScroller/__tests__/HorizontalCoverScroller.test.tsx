import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MediaType, WatchStatus } from '@prisma/client'
import { HorizontalCoverScroller } from '../HorizontalCoverScroller'
import type { LibraryItem } from '@/lib/types/library'

const baseItem = (overrides: Partial<LibraryItem> = {}): LibraryItem => ({
  id: 'entry-x',
  mediaItemId: 'media-x',
  mediaType: MediaType.MOVIE,
  status: WatchStatus.WATCHING,
  title: 'Fight Club',
  posterPath: '/poster.jpg',
  year: 1999,
  releaseDate: '1999-10-15T00:00:00.000Z',
  progressLabel: '42% WATCHED',
  progressPct: 42,
  sourceLabel: 'From TMDB',
  tmdbId: 550,
  anilistId: null,
  igdbId: null,
  steamId: null,
  createdAt: '2026-05-10T12:00:00.000Z',
  updatedAt: '2026-05-12T12:00:00.000Z',
  ...overrides,
})

// Returns the focusable inner link (or non-link content div for media types
// without a detail route, e.g. TV_EPISODE) inside the i-th listitem. The
// roving tabindex + arrow-key nav target this element, not the outer <li>.
function cellLinks(list: HTMLElement): HTMLElement[] {
  return Array.from(
    list.querySelectorAll<HTMLElement>('li.hcs-cell > .hcs-cell-link'),
  )
}

describe('HorizontalCoverScroller', () => {
  it('renders one cell per item with title + meta', () => {
    const items: LibraryItem[] = [
      baseItem({ id: 'a', title: 'Alpha' }),
      baseItem({ id: 'b', title: 'Bravo', progressLabel: 'WATCHED' }),
      baseItem({ id: 'c', title: 'Charlie', progressLabel: null }),
    ]
    render(
      <HorizontalCoverScroller
        items={items}
        emptyMessage='NOTHING ADDED YET'
        ariaLabel='Recently Added'
      />,
    )
    const list = screen.getByRole('list')
    const cells = within(list).getAllByRole('listitem')
    expect(cells).toHaveLength(3)
    expect(within(cells[0]).getByText('Alpha')).toBeInTheDocument()
    expect(within(cells[0]).getByText('MOVIE · 42% WATCHED')).toBeInTheDocument()
    expect(within(cells[2]).getByText('MOVIE')).toBeInTheDocument()
  })

  it('attaches the aria-label to the <ul> so screen readers announce it', () => {
    const items: LibraryItem[] = [baseItem({ id: 'a' })]
    render(
      <HorizontalCoverScroller
        items={items}
        emptyMessage='X'
        ariaLabel='Recently Added'
      />,
    )
    const list = screen.getByRole('list', { name: 'Recently Added' })
    expect(list).toHaveAttribute('aria-label', 'Recently Added')
  })

  it('renders EmptyStateCard band variant when items is empty', () => {
    render(
      <HorizontalCoverScroller
        items={[]}
        emptyMessage='NOTHING ADDED YET'
        emptySubtitle='Items you add appear here.'
        ariaLabel='Recently Added'
      />,
    )
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText(/NOTHING ADDED YET/)).toBeInTheDocument()
    expect(screen.getByText('Items you add appear here.')).toBeInTheDocument()
  })

  it('only the first cell-link is tab-focusable initially (roving tabindex)', () => {
    const items: LibraryItem[] = [
      baseItem({ id: 'a' }),
      baseItem({ id: 'b' }),
      baseItem({ id: 'c' }),
    ]
    render(
      <HorizontalCoverScroller
        items={items}
        emptyMessage='X'
        ariaLabel='Recently Added'
      />,
    )
    const list = screen.getByRole('list')
    const links = cellLinks(list)
    expect(links[0]).toHaveAttribute('tabindex', '0')
    expect(links[1]).toHaveAttribute('tabindex', '-1')
    expect(links[2]).toHaveAttribute('tabindex', '-1')
  })

  it('ArrowRight on the first cell moves focus to the second cell-link', () => {
    const items: LibraryItem[] = [
      baseItem({ id: 'a' }),
      baseItem({ id: 'b' }),
      baseItem({ id: 'c' }),
    ]
    render(
      <HorizontalCoverScroller
        items={items}
        emptyMessage='X'
        ariaLabel='Recently Added'
      />,
    )
    const list = screen.getByRole('list')
    const links = cellLinks(list)
    links[0].focus()
    expect(links[0]).toHaveFocus()
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(links[1]).toHaveFocus()
  })

  it('ArrowLeft on the second cell-link moves focus back to the first', () => {
    const items: LibraryItem[] = [
      baseItem({ id: 'a' }),
      baseItem({ id: 'b' }),
    ]
    render(
      <HorizontalCoverScroller
        items={items}
        emptyMessage='X'
        ariaLabel='X'
      />,
    )
    const list = screen.getByRole('list')
    const links = cellLinks(list)
    links[1].focus()
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(links[0]).toHaveFocus()
  })

  it('ArrowRight at last cell-link does nothing (no wrap)', () => {
    const items: LibraryItem[] = [baseItem({ id: 'a' }), baseItem({ id: 'b' })]
    render(
      <HorizontalCoverScroller
        items={items}
        emptyMessage='X'
        ariaLabel='X'
      />,
    )
    const list = screen.getByRole('list')
    const links = cellLinks(list)
    links[1].focus()
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(links[1]).toHaveFocus()
  })

  it('ArrowRight with focus outside (currentIdx === -1) lands focus on the first cell-link', () => {
    const items: LibraryItem[] = [
      baseItem({ id: 'a' }),
      baseItem({ id: 'b' }),
      baseItem({ id: 'c' }),
    ]
    render(
      <HorizontalCoverScroller
        items={items}
        emptyMessage='X'
        ariaLabel='X'
      />,
    )
    const list = screen.getByRole('list')
    const links = cellLinks(list)
    // Note: nothing is focused yet; fire arrow event directly on the ul.
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(links[0]).toHaveFocus()
  })

  it('boundary ArrowKey calls preventDefault so the overflow-x container does not scroll', () => {
    const items: LibraryItem[] = [baseItem({ id: 'a' }), baseItem({ id: 'b' })]
    render(
      <HorizontalCoverScroller
        items={items}
        emptyMessage='X'
        ariaLabel='X'
      />,
    )
    const list = screen.getByRole('list')
    const links = cellLinks(list)
    links[1].focus()
    const evt = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    list.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(true)
  })

  it('cell-link is a <Link> targeting /<medium>/<mediaItemId> for routable media types', () => {
    const items: LibraryItem[] = [
      baseItem({ id: 'a', mediaItemId: 'm-movie', mediaType: MediaType.MOVIE }),
      baseItem({ id: 'b', mediaItemId: 'm-tv', mediaType: MediaType.TV_SHOW }),
      baseItem({ id: 'c', mediaItemId: 'm-anime', mediaType: MediaType.ANIME }),
    ]
    render(
      <HorizontalCoverScroller items={items} emptyMessage='X' ariaLabel='X' />,
    )
    const list = screen.getByRole('list')
    const links = cellLinks(list)
    expect(links[0].getAttribute('href')).toBe('/movies/m-movie')
    expect(links[1].getAttribute('href')).toBe('/tv/m-tv')
    expect(links[2].getAttribute('href')).toBe('/anime/m-anime')
  })

  it('renders a non-link content div for TV_EPISODE (no per-episode detail route)', () => {
    const items: LibraryItem[] = [
      baseItem({
        id: 'ep-1',
        mediaItemId: 'm-ep',
        mediaType: MediaType.TV_EPISODE,
      }),
    ]
    render(
      <HorizontalCoverScroller items={items} emptyMessage='X' ariaLabel='X' />,
    )
    const list = screen.getByRole('list')
    const links = cellLinks(list)
    expect(links).toHaveLength(1)
    // Element is the focusable .hcs-cell-link wrapper but NOT an anchor.
    expect(links[0].tagName.toLowerCase()).not.toBe('a')
    expect(links[0].getAttribute('href')).toBeNull()
  })
})
