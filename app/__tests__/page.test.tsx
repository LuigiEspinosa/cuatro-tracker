import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { dashClassFor } from '@/app/page-boot-gate'

// `next/navigation` is consumed by useChannelFlipNavigate inside the page.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}))

const reducedMotionRef = { value: false }
vi.mock('@/lib/hooks/useReducedMotion', () => ({
  useReducedMotion: () => reducedMotionRef.value,
  readInitialReducedMotion: () => reducedMotionRef.value,
}))

const localStorageBacking: Record<string, string> = {}
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageBacking[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageBacking[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageBacking[key]
  }),
  clear: vi.fn(() => {
    for (const k of Object.keys(localStorageBacking)) delete localStorageBacking[k]
  }),
}

function setupLocalStorage(): void {
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  })
}

function fetchEmpty() {
  return new Response(JSON.stringify({ items: [] }), { status: 200 })
}

beforeEach(() => {
  localStorageMock.getItem.mockClear()
  localStorageMock.setItem.mockClear()
  localStorageMock.removeItem.mockClear()
  for (const k of Object.keys(localStorageBacking)) delete localStorageBacking[k]
  setupLocalStorage()
  reducedMotionRef.value = false
  vi.stubGlobal('fetch', vi.fn(async () => fetchEmpty()))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  })
  const { default: DashboardPage } = await import('@/app/page')
  return render(
    <QueryClientProvider client={client}>
      <DashboardPage />
    </QueryClientProvider>,
  )
}

describe('app/page.tsx — first-load boot gate (Story 5.5)', () => {
  // AC-7 bullet 1: 'unknown' state renders `dash-invisible`. RTL flushes
  // useEffect synchronously so the pre-effect render is not directly
  // observable from a render() result. The pure `dashClassFor` helper covers
  // the className mapping for all three phases including 'unknown'.
  it('dashClassFor returns dash + dash-invisible for unknown phase', () => {
    expect(dashClassFor('unknown')).toBe('dash dash-invisible')
  })

  it('dashClassFor returns dash + dash-ghost for playing phase', () => {
    expect(dashClassFor('playing')).toBe('dash dash-ghost')
  })

  it('dashClassFor returns bare dash for skipped phase', () => {
    expect(dashClassFor('skipped')).toBe('dash')
  })

  it('post-mount: page resolves to a valid post-effect boot phase', async () => {
    const { container } = await renderPage()
    const main = container.querySelector('main')
    expect(main).not.toBeNull()
    await waitFor(() => {
      expect(main!.getAttribute('data-boot-phase')).not.toBe('unknown')
    })
  })

  it('plays the boot overlay when localStorage is missing and motion is normal', async () => {
    const { container } = await renderPage()
    await waitFor(() => {
      expect(
        screen.getByLabelText('System boot sequence'),
      ).toBeInTheDocument()
    })
    const main = container.querySelector('main')
    expect(main).toHaveAttribute('data-boot-phase', 'playing')
    expect(main!.className).toContain('dash-ghost')
  })

  it('skips the boot when localStorage.boot.played is fresh (<24h)', async () => {
    localStorageBacking['boot.played'] = String(Date.now() - 60_000)
    const { container } = await renderPage()
    await waitFor(() => {
      expect(container.querySelector('main')).toHaveAttribute(
        'data-boot-phase',
        'skipped',
      )
    })
    expect(screen.queryByLabelText('System boot sequence')).not.toBeInTheDocument()
    const main = container.querySelector('main')
    expect(main!.className).not.toContain('dash-ghost')
    expect(main!.className).not.toContain('dash-invisible')
  })

  it('treats stale localStorage (>24h) as missing and plays the boot', async () => {
    localStorageBacking['boot.played'] = String(Date.now() - 25 * 60 * 60 * 1000)
    await renderPage()
    await waitFor(() => {
      expect(
        screen.getByLabelText('System boot sequence'),
      ).toBeInTheDocument()
    })
  })

  it('treats unparseable localStorage value as missing and plays the boot', async () => {
    localStorageBacking['boot.played'] = 'not-a-number'
    await renderPage()
    await waitFor(() => {
      expect(
        screen.getByLabelText('System boot sequence'),
      ).toBeInTheDocument()
    })
  })

  it('rejects trailing-garbage stamps like "1234abc" and plays the boot', async () => {
    localStorageBacking['boot.played'] = `${Date.now()}abc`
    await renderPage()
    await waitFor(() => {
      expect(
        screen.getByLabelText('System boot sequence'),
      ).toBeInTheDocument()
    })
  })

  it('rejects negative-numeric stamps like "-100" and plays the boot', async () => {
    localStorageBacking['boot.played'] = '-100'
    await renderPage()
    await waitFor(() => {
      expect(
        screen.getByLabelText('System boot sequence'),
      ).toBeInTheDocument()
    })
  })

  it('rejects future-dated stamps (ts > now) and plays the boot', async () => {
    localStorageBacking['boot.played'] = String(Date.now() + 60 * 60 * 1000)
    await renderPage()
    await waitFor(() => {
      expect(
        screen.getByLabelText('System boot sequence'),
      ).toBeInTheDocument()
    })
  })

  it('bypasses the boot under reduced-motion and still commits boot.played', async () => {
    reducedMotionRef.value = true
    const { container } = await renderPage()
    await waitFor(() => {
      expect(container.querySelector('main')).toHaveAttribute(
        'data-boot-phase',
        'skipped',
      )
    })
    expect(screen.queryByLabelText('System boot sequence')).not.toBeInTheDocument()
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'boot.played',
      expect.any(String),
    )
  })

  it('commits boot.played + transitions to skipped on BootSequence onComplete', async () => {
    const { container } = await renderPage()
    await waitFor(() => {
      expect(
        screen.getByLabelText('System boot sequence'),
      ).toBeInTheDocument()
    })

    // Simulate the boot finishing by pressing a key (BootSequence's keypress-
    // to-skip handler fires onComplete). Wrap in act so React flushes the
    // state transition before the assertion.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    })

    await waitFor(() => {
      expect(container.querySelector('main')).toHaveAttribute(
        'data-boot-phase',
        'skipped',
      )
    })
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'boot.played',
      expect.any(String),
    )
  })

  it('survives a throwing localStorage (Safari Private Browsing posture)', async () => {
    localStorageMock.getItem.mockImplementation(() => {
      throw new Error('storage disabled')
    })
    localStorageMock.setItem.mockImplementation(() => {
      throw new Error('storage disabled')
    })
    await renderPage()
    // Should still resolve to a valid phase ('playing' because getItem throws → null branch).
    await waitFor(() => {
      expect(
        screen.getByLabelText('System boot sequence'),
      ).toBeInTheDocument()
    })
  })
})
