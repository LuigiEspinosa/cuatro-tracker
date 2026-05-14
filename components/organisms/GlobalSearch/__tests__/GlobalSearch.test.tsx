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
    vi.stubGlobal('fetch', vi.fn())
    renderGS()
    expect(screen.getByText(/START TYPING TO SEARCH/)).toBeInTheDocument()
  })

  it('fires GET /api/search and renders results grouped by media type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ results: fightResults(), partialFailure: false }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
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
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ results: fightResults(), partialFailure: true }),
          { status: 200 },
        ),
      ),
    )
    renderGS()

    flushQuery('fight')

    await waitFor(() => {
      expect(screen.getByText(/SOME SOURCES UNAVAILABLE/)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /RETRY/ })).toBeInTheDocument()
  })

  it('shows the zero-results empty state when results are empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ results: [], partialFailure: false }),
          { status: 200 },
        ),
      ),
    )
    renderGS()

    flushQuery('zzz')

    await waitFor(() => {
      expect(screen.getByText(/NO MATCHES FOUND/)).toBeInTheDocument()
    })
  })

  it('handles network error as zero results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('boom', { status: 500 })),
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
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ results: fightResults(), partialFailure: false }),
          { status: 200 },
        ),
      ),
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
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ results: fightResults(), partialFailure: false }),
          { status: 200 },
        ),
      ),
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
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/api/search')) {
        return new Response(
          JSON.stringify({ results: fightResults(), partialFailure: false }),
          { status: 200 },
        )
      }
      postBody = init?.body ? JSON.parse(init.body as string) : null
      return new Response(
        JSON.stringify({ mediaItem: { id: 'x' }, merged: false }),
        { status: 201 },
      )
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
    const fetchMock = vi.fn(async (url: string) => {
      if (typeof url === 'string' && url.includes('/api/search')) {
        return new Response(
          JSON.stringify({ results: fightResults(), partialFailure: false }),
          { status: 200 },
        )
      }
      return new Response(
        JSON.stringify({ error: 'upstream_failed' }),
        { status: 502 },
      )
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
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ results: [], partialFailure: false }),
        { status: 200 },
      ),
    )
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

  it('Enter on a focused row navigates to the detail route stub', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ results: fightResults(), partialFailure: false }),
          { status: 200 },
        ),
      ),
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

    expect(pushMock).toHaveBeenCalledWith('/movies/550')
  })
})
