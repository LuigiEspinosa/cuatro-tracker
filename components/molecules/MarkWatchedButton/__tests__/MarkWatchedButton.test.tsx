import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WatchStatus } from '@prisma/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MarkWatchedButton } from '../MarkWatchedButton'

const routerRefreshMock = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: routerRefreshMock }),
}))

const toastSuccessMock = vi.hoisted(() => vi.fn())
const toastErrorMock = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}))

function wrap(ui: React.ReactElement): React.ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('MarkWatchedButton', () => {
  it('returns null when currentStatus is COMPLETED', () => {
    const { container } = render(
      wrap(
        <MarkWatchedButton
          mediaItemId='m1'
          currentStatus={WatchStatus.COMPLETED}
        />,
      ),
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('returns null when currentStatus is ON_HOLD (not in MARK WATCHED state machine)', () => {
    const { container } = render(
      wrap(
        <MarkWatchedButton
          mediaItemId='m1'
          currentStatus={WatchStatus.ON_HOLD}
        />,
      ),
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('returns null when currentStatus is DROPPED', () => {
    const { container } = render(
      wrap(
        <MarkWatchedButton
          mediaItemId='m1'
          currentStatus={WatchStatus.DROPPED}
        />,
      ),
    )
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders > MARK WATCHED for PLAN_TO_WATCH', () => {
    render(
      wrap(
        <MarkWatchedButton
          mediaItemId='m1'
          currentStatus={WatchStatus.PLAN_TO_WATCH}
        />,
      ),
    )
    expect(screen.getByRole('button')).toHaveTextContent('MARK WATCHED')
  })

  it('fires PUT /api/progress with next status WATCHING on click from PLAN_TO_WATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'e1',
        mediaItemId: 'm1',
        status: WatchStatus.WATCHING,
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
    render(
      wrap(
        <MarkWatchedButton
          mediaItemId='m1'
          currentStatus={WatchStatus.PLAN_TO_WATCH}
        />,
      ),
    )
    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const call = fetchMock.mock.calls[0]
    expect(call[0]).toBe('/api/progress')
    const body = JSON.parse(call[1].body as string)
    expect(body.mediaItemId).toBe('m1')
    expect(body.status).toBe(WatchStatus.WATCHING)
    expect(body.completed_at).toBeNull()
  })

  it('sets completed_at to a non-null ISO string when advancing WATCHING → COMPLETED', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'e1',
        mediaItemId: 'm1',
        status: WatchStatus.COMPLETED,
        userRating: null,
        progress: 0,
        notes: null,
        completedAt: '2026-05-15T12:00:00.000Z',
        startedAt: null,
        updatedAt: '2026-05-15T12:00:00.000Z',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(
      wrap(
        <MarkWatchedButton
          mediaItemId='m1'
          currentStatus={WatchStatus.WATCHING}
        />,
      ),
    )
    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.status).toBe(WatchStatus.COMPLETED)
    expect(typeof body.completed_at).toBe('string')
    expect(() => new Date(body.completed_at)).not.toThrow()
  })

  it('shows an error toast when the mutation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )

    const user = userEvent.setup()
    render(
      wrap(
        <MarkWatchedButton
          mediaItemId='m1'
          currentStatus={WatchStatus.PLAN_TO_WATCH}
        />,
      ),
    )
    await user.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('COULD NOT UPDATE STATUS')
    })
  })
})
