import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UserRating } from '../UserRating'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function wrap(ui: React.ReactElement): React.ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('UserRating', () => {
  it('renders 10 star buttons + numeric label', () => {
    render(wrap(<UserRating mediaItemId='m1' initialValue={7} />))
    expect(screen.getAllByRole('radio')).toHaveLength(10)
    expect(screen.getByText('7/10')).toBeInTheDocument()
  })

  it('fills stars 1 through N when initialValue=N', () => {
    render(wrap(<UserRating mediaItemId='m1' initialValue={7} />))
    const stars = screen.getAllByRole('radio')
    expect(stars[0]).toHaveAttribute('data-filled', 'true')
    expect(stars[6]).toHaveAttribute('data-filled', 'true')
    expect(stars[7]).toHaveAttribute('data-filled', 'false')
    expect(stars[9]).toHaveAttribute('data-filled', 'false')
  })

  it('displays —/10 when initialValue is null and hides the (clear) link', () => {
    render(wrap(<UserRating mediaItemId='m1' initialValue={null} />))
    expect(screen.getByText('—/10')).toBeInTheDocument()
    expect(screen.queryByText('(clear)')).toBeNull()
  })

  it('commits a new rating on star click', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'e1',
        mediaItemId: 'm1',
        status: 'WATCHING',
        userRating: 5,
        progress: 0,
        notes: null,
        completedAt: null,
        startedAt: null,
        updatedAt: '2026-05-15T12:00:00.000Z',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(wrap(<UserRating mediaItemId='m1' initialValue={null} />))
    await user.click(screen.getAllByRole('radio')[4]) // 5th star → rating 5

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.mediaItemId).toBe('m1')
    expect(body.user_rating).toBe(5)
  })

  it('clears the rating when clicking the currently-filled star at same index', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'e1',
        mediaItemId: 'm1',
        status: 'WATCHING',
        userRating: null,
        progress: 0,
        notes: null,
        completedAt: null,
        startedAt: null,
        updatedAt: '2026-05-15T12:00:00.000Z',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(wrap(<UserRating mediaItemId='m1' initialValue={7} />))
    await user.click(screen.getAllByRole('radio')[6]) // 7th star → clears

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.user_rating).toBeNull()
  })

  it('clears via the explicit (clear) link', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'e1',
        mediaItemId: 'm1',
        status: 'WATCHING',
        userRating: null,
        progress: 0,
        notes: null,
        completedAt: null,
        startedAt: null,
        updatedAt: '2026-05-15T12:00:00.000Z',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(wrap(<UserRating mediaItemId='m1' initialValue={5} />))
    await user.click(screen.getByText('(clear)'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.user_rating).toBeNull()
  })
})
