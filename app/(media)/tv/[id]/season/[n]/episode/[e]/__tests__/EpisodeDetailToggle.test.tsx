import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WatchStatus } from '@prisma/client'

const routerMock = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
}))

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toastMock }))

const fetchMock = vi.fn()

import { EpisodeDetailToggle } from '@/app/(media)/tv/[id]/season/[n]/episode/[e]/EpisodeDetailToggle'

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
})

describe('EpisodeDetailToggle', () => {
  it('fires PUT /api/progress with the inverse status on click + refreshes the router on success', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    wrap(
      <EpisodeDetailToggle
        mediaItemId='ep-1'
        showId='show-1'
        initialStatus={WatchStatus.PLAN_TO_WATCH}
        unaired={false}
        label='Mark episode watched'
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark episode watched' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/progress')
    expect(init.method).toBe('PUT')
    const body = JSON.parse(init.body)
    expect(body).toEqual({
      mediaItemId: 'ep-1',
      status: WatchStatus.COMPLETED,
    })
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled())
  })

  it('toggles back to PLAN_TO_WATCH when currently COMPLETED', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    wrap(
      <EpisodeDetailToggle
        mediaItemId='ep-1'
        showId='show-1'
        initialStatus={WatchStatus.COMPLETED}
        unaired={false}
        label='Mark episode watched'
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark episode watched' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.status).toBe(WatchStatus.PLAN_TO_WATCH)
  })

  it('shows a Sonner error toast and rolls back optimistic state on a failed PUT', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    wrap(
      <EpisodeDetailToggle
        mediaItemId='ep-1'
        showId='show-1'
        initialStatus={WatchStatus.PLAN_TO_WATCH}
        unaired={false}
        label='Mark episode watched'
      />,
    )
    const box = screen.getByRole('checkbox', { name: 'Mark episode watched' })
    fireEvent.click(box)
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith('COULD NOT UPDATE EPISODE'))
    // Optimistic flip rolled back: aria-checked returned to false.
    await waitFor(() => expect(box.getAttribute('aria-checked')).toBe('false'))
  })

  it('invalidates both [library, tv] AND [tvDetail, showId] queryKeys on success (F10 guard)', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    render(
      <QueryClientProvider client={client}>
        <EpisodeDetailToggle
          mediaItemId='ep-1'
          showId='show-42'
          initialStatus={WatchStatus.PLAN_TO_WATCH}
          unaired={false}
          label='Mark episode watched'
        />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mark episode watched' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await waitFor(() => expect(routerMock.refresh).toHaveBeenCalled())
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['library', 'tv'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['tvDetail', 'show-42'] })
  })

  it('disabled state when unaired prevents PUT call', () => {
    wrap(
      <EpisodeDetailToggle
        mediaItemId='ep-1'
        showId='show-1'
        initialStatus={null}
        unaired={true}
        label='Mark future episode watched'
      />,
    )
    const box = screen.getByRole('checkbox', {
      name: 'Mark future episode watched',
      hidden: true,
    })
    fireEvent.click(box)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
