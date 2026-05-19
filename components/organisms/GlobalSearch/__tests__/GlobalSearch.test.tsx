import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { GlobalSearch } from '../GlobalSearch'
import type { UnifiedSearchResult } from '@/lib/search/federation'

const pushMock = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: toastMock,
  Toaster: () => null,
}))

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  })
}

function renderGS() {
  const client = makeQueryClient()
  return render(
    <QueryClientProvider client={client}>
      <GlobalSearch />
    </QueryClientProvider>,
  )
}

/* Route fetch mocks by URL so the library-subscription call (`/api/library?limit=100`)
 * and the search call (`/api/search`) each receive their own fresh Response.
 * A single shared `mockResolvedValue(new Response(...))` is broken — Response
 * bodies can only be consumed once and the library subscription fires on mount,
 * before the search query. */
function routedFetchMock(routes: {
  search?: () => Response
  library?: () => Response
  media?: (init?: RequestInit) => Response
}): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : ''
    if (u.includes('/api/library')) {
      return (
        routes.library?.() ??
        new Response(JSON.stringify({ items: [] }), { status: 200 })
      )
    }
    if (u.includes('/api/search')) {
      return (
        routes.search?.() ??
        new Response(
          JSON.stringify({ results: [], partialFailure: false }),
          { status: 200 },
        )
      )
    }
    if (u.includes('/api/media')) {
      return (
        routes.media?.(init) ??
        new Response(JSON.stringify({ mediaItem: { id: 'x' } }), { status: 201 })
      )
    }
    return new Response('not_routed', { status: 500 })
  })
}

function fightResults(): UnifiedSearchResult[] {
  return [
    {
      type: 'movie',
      title: 'Fight Club',
      release_year: 1999,
      poster_path: '/fightclub.jpg',
      overview: 'A ticking-time-bomb insomniac...',
      primary_source: 'tmdb',
      tmdb_id: 550,
      confidence: 1.0,
    },
    {
      type: 'tv',
      title: 'Cobra Kai',
      release_year: 2018,
      poster_path: '/cobra.jpg',
      overview: 'Decades later the rivalry reignites.',
      primary_source: 'tmdb',
      tmdb_id: 77169,
      confidence: 1.0,
    },
  ]
}

function flushQuery(value: string) {
  vi.useFakeTimers()
  const input = screen.getByRole('searchbox') as HTMLInputElement
  fireEvent.change(input, { target: { value } })
  act(() => {
    vi.advanceTimersByTime(200)
  })
  vi.useRealTimers()
}

describe('GlobalSearch', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the idle empty state when query is empty', () => {
    vi.stubGlobal('fetch', routedFetchMock({}))
    renderGS()
    expect(screen.getByText(/START TYPING TO SEARCH/)).toBeInTheDocument()
  })

  it('fires GET /api/search and renders results grouped by media type', async () => {
    const fetchMock = routedFetchMock({
      search: () =>
        new Response(
          JSON.stringify({ results: fightResults(), partialFailure: false }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    })
    vi.stubGlobal('fetch', fetchMock)
    renderGS()

    flushQuery('fight')

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Fight Club' }),
      ).toBeInTheDocument()
    })
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/search?q=fight'),
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(
      screen.getByRole('heading', { name: 'Cobra Kai' }),
    ).toBeInTheDocument()
    // FilterChip + section header both render MOVIES/TV; scope to the section
    // header via its sibling rule element's parent.
    const sectionLabels = screen
      .getAllByText('MOVIES')
      .filter((el) => el.classList.contains('gs-section-label'))
    expect(sectionLabels).toHaveLength(1)
  })

  it('shows the partial-failure banner when the API flags partialFailure', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetchMock({
        search: () =>
          new Response(
            JSON.stringify({ results: fightResults(), partialFailure: true }),
            { status: 200 },
          ),
      }),
    )
    renderGS()

    flushQuery('fight')

    await waitFor(() => {
      expect(screen.getByText(/SOME SOURCES UNAVAILABLE/)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /RETRY/ })).toBeInTheDocument()
  })

  it('shows the zero-results empty state when results are empty', async () => {
    vi.stubGlobal('fetch', routedFetchMock({}))
    renderGS()

    flushQuery('zzz')

    await waitFor(() => {
      expect(screen.getByText(/NO MATCHES FOUND/)).toBeInTheDocument()
    })
  })

  it('handles network error as zero results', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetchMock({
        search: () => new Response('boom', { status: 500 }),
      }),
    )
    renderGS()

    flushQuery('fight')

    await waitFor(() => {
      expect(screen.getByText(/NO MATCHES FOUND/)).toBeInTheDocument()
    })
  })

  it('arrow-down cycles focus through results', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetchMock({
        search: () =>
          new Response(
            JSON.stringify({ results: fightResults(), partialFailure: false }),
            { status: 200 },
          ),
      }),
    )
    const { container } = renderGS()

    flushQuery('fight')

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Fight Club' }),
      ).toBeInTheDocument()
    })

    const root = container.querySelector('.gs')!
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    let focusedRow = container.querySelector('li[data-focused="true"]')
    expect(focusedRow?.textContent).toContain('Fight Club')

    fireEvent.keyDown(root, { key: 'ArrowDown' })
    focusedRow = container.querySelector('li[data-focused="true"]')
    expect(focusedRow?.textContent).toContain('Cobra Kai')
  })

  it('Escape clears the input', async () => {
    vi.stubGlobal(
      'fetch',
      routedFetchMock({
        search: () =>
          new Response(
            JSON.stringify({ results: fightResults(), partialFailure: false }),
            { status: 200 },
          ),
      }),
    )
    const { container } = renderGS()
    flushQuery('fight')
    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Fight Club' }),
      ).toBeInTheDocument()
    })

    const root = container.querySelector('.gs')!
    fireEvent.keyDown(root, { key: 'Escape' })

    const input = screen.getByRole('searchbox') as HTMLInputElement
    expect(input.value).toBe('')
    await waitFor(() => {
      expect(screen.getByText(/START TYPING TO SEARCH/)).toBeInTheDocument()
    })
  })

  it('POST /api/media on add click + fires success toast', async () => {
    let postBody: unknown = null
    const fetchMock = routedFetchMock({
      search: () =>
        new Response(
          JSON.stringify({ results: fightResults(), partialFailure: false }),
          { status: 200 },
        ),
      media: (init) => {
        postBody = init?.body ? JSON.parse(init.body as string) : null
        return new Response(
          JSON.stringify({ mediaItem: { id: 'x' }, merged: false }),
          { status: 201 },
        )
      },
    })
    vi.stubGlobal('fetch', fetchMock)

    renderGS()
    flushQuery('fight')
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Fight Club' }),
      ).toBeInTheDocument(),
    )

    const buttons = screen.getAllByRole('button', { name: /ADD TO LIBRARY/ })
    buttons[0].click()

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalled()
    })
    expect(postBody).toEqual({
      source: 'tmdb',
      sourceId: 550,
      type: 'MOVIE',
    })
  })

  it('fires destructive toast on add failure', async () => {
    const fetchMock = routedFetchMock({
      search: () =>
        new Response(
          JSON.stringify({ results: fightResults(), partialFailure: false }),
          { status: 200 },
        ),
      media: () =>
        new Response(
          JSON.stringify({ error: 'upstream_failed' }),
          { status: 502 },
        ),
    })
    vi.stubGlobal('fetch', fetchMock)

    renderGS()
    flushQuery('fight')
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Fight Club' }),
      ).toBeInTheDocument(),
    )

    const buttons = screen.getAllByRole('button', { name: /ADD TO LIBRARY/ })
    buttons[0].click()

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalled()
    })
  })

  it('sends type=movie when MOVIES filter is active', async () => {
    const fetchMock = routedFetchMock({})
    vi.stubGlobal('fetch', fetchMock)

    renderGS()

    screen.getByRole('tab', { name: /^MOVIES/ }).click()
    flushQuery('fight')

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('type=movie'),
        expect.any(Object),
      )
    })
  })

  it('flips the inLibrary chip on a row whose tmdb_id is in the library subscription', async () => {
    // Library returns Fight Club (tmdb_id 550); search returns Fight Club + Cobra Kai.
    // Only Fight Club should render the IN LIBRARY chip.
    vi.stubGlobal(
      'fetch',
      routedFetchMock({
        library: () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'entry-1',
                  mediaItemId: 'm-1',
                  mediaType: 'MOVIE',
                  status: 'WATCHING',
                  title: 'Fight Club',
                  posterPath: '/poster.jpg',
                  year: 1999,
                  releaseDate: '1999-10-15T00:00:00.000Z',
                  progressLabel: null,
                  progressPct: null,
                  sourceLabel: 'From TMDB',
                  tmdbId: 550,
                  anilistId: null,
                  igdbId: null,
                  steamId: null,
                  createdAt: '2026-05-10T00:00:00.000Z',
                  updatedAt: '2026-05-10T00:00:00.000Z',
                },
              ],
            }),
            { status: 200 },
          ),
        search: () =>
          new Response(
            JSON.stringify({ results: fightResults(), partialFailure: false }),
            { status: 200 },
          ),
      }),
    )
    renderGS()

    flushQuery('fight')

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Fight Club' }),
      ).toBeInTheDocument()
    })

    // The library subscription is independent — wait for both data sets.
    await waitFor(() => {
      expect(screen.getByText('✓ IN LIBRARY')).toBeInTheDocument()
    })

    // Cobra Kai (tmdb 77169) is NOT in the library → still shows ADD button.
    const addButtons = screen.getAllByRole('button', { name: /ADD TO LIBRARY/ })
    expect(addButtons).toHaveLength(1)
  })

  it('Enter on a focused in-library row navigates to /<medium>/<MediaItem.id>', async () => {
    // Detail pages route by MediaItem.id, not by the external source id. The
    // library subscription provides the mapping; the bundle-2 hotfix uses that
    // map to construct the correct URL.
    vi.stubGlobal(
      'fetch',
      routedFetchMock({
        library: () =>
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'entry-1',
                  mediaItemId: 'm-fightclub',
                  mediaType: 'MOVIE',
                  status: 'PLAN_TO_WATCH',
                  title: 'Fight Club',
                  posterPath: '/poster.jpg',
                  year: 1999,
                  releaseDate: '1999-10-15T00:00:00.000Z',
                  progressLabel: null,
                  progressPct: null,
                  sourceLabel: 'From TMDB',
                  tmdbId: 550,
                  anilistId: null,
                  igdbId: null,
                  steamId: null,
                  createdAt: '2026-05-10T00:00:00.000Z',
                  updatedAt: '2026-05-10T00:00:00.000Z',
                },
              ],
            }),
            { status: 200 },
          ),
        search: () =>
          new Response(
            JSON.stringify({ results: fightResults(), partialFailure: false }),
            { status: 200 },
          ),
      }),
    )
    const { container } = renderGS()
    flushQuery('fight')
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Fight Club' }),
      ).toBeInTheDocument(),
    )
    // Wait for the library subscription to populate before pressing Enter,
    // otherwise handleOpenDetail no-ops as if Fight Club weren't in the lib.
    await waitFor(() => {
      expect(screen.getByText('✓ IN LIBRARY')).toBeInTheDocument()
    })

    const root = container.querySelector('.gs')!
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    fireEvent.keyDown(root, { key: 'Enter' })

    expect(pushMock).toHaveBeenCalledWith('/movies/m-fightclub')
  })

  it('Enter on a focused NOT-in-library row navigates to /preview/<source>/<type>/<sourceId>', async () => {
    // For results that aren't in the library, the canonical detail page
    // doesn't exist (it requires a MediaItem.id). The preview route fetches
    // the source data on-the-fly and offers an ADD button.
    vi.stubGlobal(
      'fetch',
      routedFetchMock({
        search: () =>
          new Response(
            JSON.stringify({ results: fightResults(), partialFailure: false }),
            { status: 200 },
          ),
      }),
    )
    const { container } = renderGS()
    flushQuery('fight')
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Fight Club' }),
      ).toBeInTheDocument(),
    )

    const root = container.querySelector('.gs')!
    fireEvent.keyDown(root, { key: 'ArrowDown' })
    fireEvent.keyDown(root, { key: 'Enter' })

    // fightResults() puts Fight Club first: source=tmdb, type=movie, tmdb_id=550.
    expect(pushMock).toHaveBeenCalledWith('/preview/tmdb/movie/550')
  })
})
