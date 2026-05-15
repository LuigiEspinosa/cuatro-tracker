import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MediaType, WatchStatus } from '@prisma/client'
import { LibraryGrid, MOVIE_SORT_OPTIONS } from '../LibraryGrid'
import type { LibraryItem } from '@/lib/types/library'

// Spy on window.history.replaceState because LibraryGrid uses it (NOT
// router.replace) for URL sync — see the writeUrl helper for why.
const replaceStateSpy = vi.fn()

// Mock global fetch so useQuery never throws under jsdom. The mock returns an
// empty library by default; specific tests can override via mockResolvedValue.
const fetchMock = vi.fn(
  async () =>
    new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
)

vi.mock('next/navigation', () => ({
  // useRouter still has to exist for any internal Next.js wiring even though
  // LibraryGrid doesn't call .replace anymore.
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

// SearchInput emits onChange via its internal debounce. To keep tests fast +
// deterministic, mock it with a plain controlled input.
vi.mock('@/components/molecules/SearchInput', () => ({
  SearchInput: ({ value, onChange, placeholder }: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
  }) => (
    <input
      type='search'
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid='search-input'
    />
  ),
}))

// FramedCover is server-only (no `"use client"`) but the test runner renders
// it client-side. The chrome SVGs require client config; stub to a simple img.
vi.mock('@/components/molecules/FramedCover', () => ({
  FramedCover: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test stub for FramedCover; next/image is not needed in jsdom and would force a Next runtime.
    <img src={src} alt={alt} data-testid='framed-cover' />
  ),
}))

vi.mock('@/lib/api/tmdb-images', () => ({
  getImageUrl: (path: string | null) =>
    path ? `https://image.tmdb.org/t/p/w342${path}` : null,
}))

const sampleItem = (overrides: Partial<LibraryItem> = {}): LibraryItem => ({
  id: 'entry-1',
  mediaItemId: 'movie-1',
  mediaType: MediaType.MOVIE,
  status: WatchStatus.WATCHING,
  title: 'Sample Movie',
  posterPath: '/poster.jpg',
  year: 2024,
  releaseDate: '2024-01-01T00:00:00.000Z',
  progressLabel: null,
  progressPct: null,
  sourceLabel: null,
  tmdbId: 550,
  anilistId: null,
  igdbId: null,
  steamId: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

function renderGrid(props: Partial<React.ComponentProps<typeof LibraryGrid>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  return render(
    <QueryClientProvider client={client}>
      <LibraryGrid
        mediaType='movies'
        initialItems={[sampleItem()]}
        initialSort='recently_added'
        initialStatus={null}
        initialSearch=''
        sortOptions={MOVIE_SORT_OPTIONS}
        {...props}
      />
    </QueryClientProvider>,
  )
}

let originalReplaceState: typeof window.history.replaceState

beforeEach(() => {
  replaceStateSpy.mockClear()
  fetchMock.mockClear()
  originalReplaceState = window.history.replaceState
  window.history.replaceState = replaceStateSpy as unknown as typeof window.history.replaceState
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  window.history.replaceState = originalReplaceState
  vi.unstubAllGlobals()
})

describe('LibraryGrid', () => {
  it('renders the grid with initial items', () => {
    renderGrid()
    expect(screen.getByRole('grid')).toBeInTheDocument()
    expect(screen.getByLabelText(/Sample Movie/)).toBeInTheDocument()
  })

  it('renders the per-medium EmptyLibraryState when initialItems is empty and no filters', () => {
    renderGrid({ initialItems: [] })
    expect(screen.getByText('> NO MOVIES IN LIBRARY')).toBeInTheDocument()
    expect(screen.getByText('> ADD A MOVIE')).toBeInTheDocument()
  })

  it('renders the filtered-zero state when initialItems is empty AND a filter is active', () => {
    renderGrid({ initialItems: [], initialSearch: 'spielberg' })
    expect(
      screen.getByText('> NO RESULTS FOR "SPIELBERG"'),
    ).toBeInTheDocument()
    expect(screen.getByText('CLEAR FILTERS')).toBeInTheDocument()
  })

  it('CLEAR FILTERS clears search + status when clicked', async () => {
    renderGrid({
      initialItems: [],
      initialSearch: 'spielberg',
      initialStatus: WatchStatus.WATCHING,
    })
    fireEvent.click(screen.getByText('CLEAR FILTERS'))
    // After clearing, the queryKey changes; a fresh fetch fires (mocked to
    // return { items: [] }); on resolution the empty-library state replaces
    // the filtered-zero state because hasActiveQuery is now false.
    await waitFor(() => {
      expect(screen.getByText('> NO MOVIES IN LIBRARY')).toBeInTheDocument()
    })
  })

  it('cards are anchors linking to /movies/[mediaItemId]', () => {
    renderGrid()
    const card = screen.getByLabelText(/Sample Movie/) as HTMLAnchorElement
    expect(card.getAttribute('href')).toBe('/movies/movie-1')
  })

  it('clicking a status chip in the toolbar updates the URL and refilters', async () => {
    renderGrid()
    // The WATCHING label also renders inside the MediaCardOverlay for the
    // sample item. Scope the click to the toolbar's status chip group.
    const statusGroup = screen.getByRole('group', { name: /status/i })
    const watchingChip = Array.from(
      statusGroup.querySelectorAll<HTMLButtonElement>('button'),
    ).find((b) => b.textContent === 'WATCHING')
    expect(watchingChip).toBeDefined()
    fireEvent.click(watchingChip!)
    await waitFor(() => {
      const calls = replaceStateSpy.mock.calls
      const lastUrl = calls[calls.length - 1]?.[2] as string | undefined
      expect(lastUrl).toContain('status=WATCHING')
    })
  })

  it('Escape clears active filters + search when one is set', async () => {
    renderGrid({ initialStatus: WatchStatus.WATCHING })
    fireEvent.keyDown(window, { key: 'Escape' })
    // After clearing the status, the URL replaceState fires without status=.
    await waitFor(() => {
      const calls = replaceStateSpy.mock.calls
      const lastUrl = calls[calls.length - 1]?.[2] as string | undefined
      expect(lastUrl).not.toContain('status=')
    })
  })

  it('renders a fallback when posterPath is null', () => {
    renderGrid({ initialItems: [sampleItem({ posterPath: null })] })
    expect(screen.queryByTestId('framed-cover')).toBeNull()
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('renders the PhosphorLED status pill with the correct data-status', () => {
    const { container } = renderGrid()
    const led = container.querySelector('.library-grid-card-led')
    expect(led?.getAttribute('data-status')).toBe('watching')
  })
})
