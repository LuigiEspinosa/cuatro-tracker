import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WatchStatus } from '@prisma/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DetailHero } from '../DetailHero'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// Stub FramedCover — its `next/image` + SVG mask chain pulls in too much for jsdom.
vi.mock('@/components/molecules/FramedCover/FramedCover', () => ({
  FramedCover: ({ alt }: { alt: string }) => (
    <div data-testid='framed-cover' aria-label={alt} />
  ),
}))

function wrap(ui: React.ReactElement): React.ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>
}

describe('DetailHero', () => {
  const baseProps = {
    mediaItemId: 'm1',
    medium: 'movies' as const,
    mediumLabel: 'MOVIE · 1999',
    title: 'Fight Club',
    originalTitle: null as string | null,
    posterUrl: '/poster.jpg',
    metadata: [{ value: '139 MIN' }, { value: 'DAVID FINCHER' }],
    currentStatus: WatchStatus.WATCHING,
    userRating: 7,
    showQbtButton: true,
  }

  it('renders title and medium label', () => {
    render(wrap(<DetailHero {...baseProps} />))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Fight Club',
    )
    expect(screen.getByText('MOVIE · 1999')).toBeInTheDocument()
  })

  it('renders FramedCover with the title as alt', () => {
    render(wrap(<DetailHero {...baseProps} />))
    expect(screen.getByTestId('framed-cover')).toHaveAttribute(
      'aria-label',
      'Fight Club',
    )
  })

  it('hides original title when it matches title', () => {
    const { container } = render(
      wrap(<DetailHero {...baseProps} originalTitle='Fight Club' />),
    )
    expect(container.querySelector('.detail-hero-original-title')).toBeNull()
  })

  it('shows original title when it differs from title', () => {
    render(
      wrap(<DetailHero {...baseProps} originalTitle='Sōsō no Frieren' />),
    )
    expect(screen.getByText('Sōsō no Frieren')).toBeInTheDocument()
  })

  it('hides SEND TO qBT button when showQbtButton is false', () => {
    render(wrap(<DetailHero {...baseProps} showQbtButton={false} />))
    expect(
      screen.queryByRole('button', { name: /SEND TO qBT/i }),
    ).toBeNull()
  })
})
