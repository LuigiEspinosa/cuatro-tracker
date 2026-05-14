import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SearchResultRow } from '../SearchResultRow'
import type { UnifiedSearchResult } from '@/lib/search/federation'

function makeResult(overrides: Partial<UnifiedSearchResult> = {}): UnifiedSearchResult {
  return {
    type: 'movie',
    title: 'Fight Club',
    release_year: 1999,
    poster_path: '/poster.jpg',
    overview: 'A ticking-time-bomb insomniac...',
    primary_source: 'tmdb',
    tmdb_id: 550,
    confidence: 1.0,
    ...overrides,
  }
}

describe('SearchResultRow', () => {
  beforeEach(() => {
    cleanup()
  })

  it('renders title, type/year metadata, and overview', () => {
    render(
      <SearchResultRow
        result={makeResult()}
        inLibrary={false}
        isFocused={false}
        addingPending={false}
        onAdd={() => {}}
        onOpenDetail={() => {}}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Fight Club' })).toBeInTheDocument()
    expect(screen.getByText('MOVIE')).toBeInTheDocument()
    expect(screen.getByText('1999')).toBeInTheDocument()
    expect(screen.getByText(/A ticking-time-bomb/)).toBeInTheDocument()
  })

  it('omits the overview block when overview is null', () => {
    const { container } = render(
      <SearchResultRow
        result={makeResult({ overview: null })}
        inLibrary={false}
        isFocused={false}
        addingPending={false}
        onAdd={() => {}}
        onOpenDetail={() => {}}
      />,
    )
    expect(container.querySelector('.sr-overview')).toBeNull()
  })

  it("renders '—' when release_year is missing", () => {
    render(
      <SearchResultRow
        result={makeResult({ release_year: undefined })}
        inLibrary={false}
        isFocused={false}
        addingPending={false}
        onAdd={() => {}}
        onOpenDetail={() => {}}
      />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders the source chips for every present source ID', () => {
    render(
      <SearchResultRow
        result={makeResult({ tmdb_id: 550, anilist_id: 1234 })}
        inLibrary={false}
        isFocused={false}
        addingPending={false}
        onAdd={() => {}}
        onOpenDetail={() => {}}
      />,
    )
    expect(screen.getByText('TMDB')).toBeInTheDocument()
    expect(screen.getByText('ANILIST')).toBeInTheDocument()
  })

  it('shows "> ADD TO LIBRARY" when not in library, fires onAdd on click', () => {
    const onAdd = vi.fn()
    render(
      <SearchResultRow
        result={makeResult()}
        inLibrary={false}
        isFocused={false}
        addingPending={false}
        onAdd={onAdd}
        onOpenDetail={() => {}}
      />,
    )
    const button = screen.getByRole('button', { name: /ADD TO LIBRARY/ })
    button.click()
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it('shows "> ADDING…" when addingPending is true, button is disabled', () => {
    const onAdd = vi.fn()
    render(
      <SearchResultRow
        result={makeResult()}
        inLibrary={false}
        isFocused={false}
        addingPending={true}
        onAdd={onAdd}
        onOpenDetail={() => {}}
      />,
    )
    const button = screen.getByRole('button', { name: /ADDING/ })
    expect(button).toBeDisabled()
    button.click()
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('shows "✓ IN LIBRARY" when inLibrary is true, navigates to detail on click', () => {
    const onOpenDetail = vi.fn()
    render(
      <SearchResultRow
        result={makeResult()}
        inLibrary={true}
        watchStatus='PLAN_TO_WATCH'
        isFocused={false}
        addingPending={false}
        onAdd={() => {}}
        onOpenDetail={onOpenDetail}
      />,
    )
    const button = screen.getByRole('button', { name: /IN LIBRARY/ })
    button.click()
    expect(onOpenDetail).toHaveBeenCalledOnce()
  })

  it('shows PhosphorLED + WatchStatus in the meta line when inLibrary', () => {
    render(
      <SearchResultRow
        result={makeResult()}
        inLibrary={true}
        watchStatus='WATCHING'
        isFocused={false}
        addingPending={false}
        onAdd={() => {}}
        onOpenDetail={() => {}}
      />,
    )
    expect(screen.getByText('WATCHING')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'WATCHING' })).toBeInTheDocument()
  })

  it('reflects focus state via data-focused on the <li>', () => {
    const { container, rerender } = render(
      <SearchResultRow
        result={makeResult()}
        inLibrary={false}
        isFocused={false}
        addingPending={false}
        onAdd={() => {}}
        onOpenDetail={() => {}}
      />,
    )
    expect(container.querySelector('li')?.getAttribute('data-focused')).toBe('false')
    rerender(
      <SearchResultRow
        result={makeResult()}
        inLibrary={false}
        isFocused={true}
        addingPending={false}
        onAdd={() => {}}
        onOpenDetail={() => {}}
      />,
    )
    expect(container.querySelector('li')?.getAttribute('data-focused')).toBe('true')
  })

  it('fires onOpenDetail on Enter, onAdd on ⌘+Enter', () => {
    const onAdd = vi.fn()
    const onOpenDetail = vi.fn()
    const { container } = render(
      <SearchResultRow
        result={makeResult()}
        inLibrary={false}
        isFocused={true}
        addingPending={false}
        onAdd={onAdd}
        onOpenDetail={onOpenDetail}
      />,
    )
    const li = container.querySelector('li')!

    fireEvent.keyDown(li, { key: 'Enter' })
    expect(onOpenDetail).toHaveBeenCalledOnce()
    expect(onAdd).not.toHaveBeenCalled()

    fireEvent.keyDown(li, { key: 'Enter', metaKey: true })
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it('renders the fallback ? glyph when poster_path is null', () => {
    const { container } = render(
      <SearchResultRow
        result={makeResult({ poster_path: null })}
        inLibrary={false}
        isFocused={false}
        addingPending={false}
        onAdd={() => {}}
        onOpenDetail={() => {}}
      />,
    )
    expect(container.querySelector('.sr-cover-fallback')?.textContent).toBe('?')
  })
})
