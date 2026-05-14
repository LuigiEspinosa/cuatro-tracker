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
  createdAt: '2026-05-10T12:00:00.000Z',
  updatedAt: '2026-05-12T12:00:00.000Z',
  ...overrides,
})

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

  it('only the first cell is tab-focusable initially (roving tabindex)', () => {
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
    const cells = within(list).getAllByRole('listitem')
    expect(cells[0]).toHaveAttribute('tabindex', '0')
    expect(cells[1]).toHaveAttribute('tabindex', '-1')
    expect(cells[2]).toHaveAttribute('tabindex', '-1')
  })

  it('ArrowRight on the first cell moves focus to the second cell', () => {
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
    const cells = within(list).getAllByRole('listitem')
    cells[0].focus()
    expect(cells[0]).toHaveFocus()
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(cells[1]).toHaveFocus()
  })

  it('ArrowLeft on the second cell moves focus back to the first', () => {
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
    const cells = within(list).getAllByRole('listitem')
    cells[1].focus()
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(cells[0]).toHaveFocus()
  })

  it('ArrowRight at last cell does nothing (no wrap)', () => {
    const items: LibraryItem[] = [baseItem({ id: 'a' }), baseItem({ id: 'b' })]
    render(
      <HorizontalCoverScroller
        items={items}
        emptyMessage='X'
        ariaLabel='X'
      />,
    )
    const list = screen.getByRole('list')
    const cells = within(list).getAllByRole('listitem')
    cells[1].focus()
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(cells[1]).toHaveFocus()
  })

  it('ArrowRight with focus outside (currentIdx === -1) lands focus on the first cell', () => {
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
    const cells = within(list).getAllByRole('listitem')
    // Note: nothing is focused yet; fire arrow event directly on the ul.
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(cells[0]).toHaveFocus()
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
    const cells = within(list).getAllByRole('listitem')
    cells[1].focus()
    const evt = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true })
    list.dispatchEvent(evt)
    expect(evt.defaultPrevented).toBe(true)
  })
})
