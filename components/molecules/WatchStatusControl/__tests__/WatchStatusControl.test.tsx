import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WatchStatus } from '@prisma/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WatchStatusControl } from '../WatchStatusControl'

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

describe('WatchStatusControl', () => {
  it('renders the current status label', () => {
    render(
      wrap(
        <WatchStatusControl
          mediaItemId='m1'
          currentStatus={WatchStatus.WATCHING}
        />,
      ),
    )
    expect(
      screen.getByRole('button', { name: /WATCHING/i }),
    ).toBeInTheDocument()
  })

  it('opens the dropdown panel on click and shows 5 options', async () => {
    const user = userEvent.setup()
    render(
      wrap(
        <WatchStatusControl
          mediaItemId='m1'
          currentStatus={WatchStatus.PLAN_TO_WATCH}
        />,
      ),
    )
    await user.click(screen.getByRole('button', { expanded: false }))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(5)
  })

  it('fires PUT /api/progress when a new status is selected', async () => {
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
        <WatchStatusControl
          mediaItemId='m1'
          currentStatus={WatchStatus.WATCHING}
        />,
      ),
    )
    await user.click(screen.getByRole('button', { expanded: false }))
    const completedOption = screen
      .getAllByRole('option')
      .find((el) => /COMPLETED/i.test(el.textContent ?? ''))
    expect(completedOption).toBeTruthy()
    await user.click(completedOption!)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.mediaItemId).toBe('m1')
    expect(body.status).toBe(WatchStatus.COMPLETED)
    expect(typeof body.completed_at).toBe('string')
  })

  it('does not fire mutation when the same status is selected', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(
      wrap(
        <WatchStatusControl
          mediaItemId='m1'
          currentStatus={WatchStatus.WATCHING}
        />,
      ),
    )
    await user.click(screen.getByRole('button', { expanded: false }))
    const watchingOption = screen
      .getAllByRole('option')
      .find((el) => el.getAttribute('aria-selected') === 'true')
    expect(watchingOption).toBeTruthy()
    await user.click(watchingOption!)

    // listbox closes, no fetch
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
