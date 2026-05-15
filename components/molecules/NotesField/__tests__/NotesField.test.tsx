import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { NotesField } from '../NotesField'

function wrap(ui: React.ReactElement): React.ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NotesField', () => {
  it('renders collapsed when initialNotes is empty', () => {
    render(wrap(<NotesField mediaItemId='m1' initialNotes='' />))
    expect(screen.getByRole('button', { name: /NOTES \(0\)/i })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('renders expanded when initialNotes is non-empty', () => {
    render(
      wrap(<NotesField mediaItemId='m1' initialNotes='Existing note' />),
    )
    expect(screen.getByRole('textbox')).toHaveValue('Existing note')
    expect(screen.getByText('SAVED')).toBeInTheDocument()
  })

  it('expands on click and shows the textarea', async () => {
    const user = userEvent.setup()
    render(wrap(<NotesField mediaItemId='m1' initialNotes='' />))
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('debounces saves: typing then 800ms triggers exactly one PUT', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'e1',
        mediaItemId: 'm1',
        status: 'WATCHING',
        userRating: null,
        progress: 0,
        notes: 'hello',
        completedAt: null,
        startedAt: null,
        updatedAt: '2026-05-15T12:00:00.000Z',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    render(wrap(<NotesField mediaItemId='m1' initialNotes='' />))
    await user.click(screen.getByRole('button')) // expand
    await user.type(screen.getByRole('textbox'), 'hello')

    // immediate: no fetch yet
    expect(fetchMock).not.toHaveBeenCalled()

    // advance 800ms: debounce flushes
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.notes).toBe('hello')
    expect(body.mediaItemId).toBe('m1')
  })

  it('flushes pending save on blur (no debounce wait)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'e1',
        mediaItemId: 'm1',
        status: 'WATCHING',
        userRating: null,
        progress: 0,
        notes: 'x',
        completedAt: null,
        startedAt: null,
        updatedAt: '2026-05-15T12:00:00.000Z',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    render(
      wrap(<NotesField mediaItemId='m1' initialNotes='existing' />),
    )
    const textarea = screen.getByRole('textbox')
    await user.click(textarea)
    await user.keyboard('x')
    // blur: flush immediately
    await user.tab()

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  it('shows SAVE FAILED indicator when the mutation errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    )

    const user = userEvent.setup()
    render(
      wrap(<NotesField mediaItemId='m1' initialNotes='existing' />),
    )
    await user.click(screen.getByRole('textbox'))
    await user.keyboard('x')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByText('SAVE FAILED')).toBeInTheDocument()
    })
  })
})
