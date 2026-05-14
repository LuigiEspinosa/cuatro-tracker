import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardSystemWidget } from '../DashboardSystemWidget'

describe('DashboardSystemWidget', () => {
  describe('zero state', () => {
    it('renders > NO ACTIVE DOWNLOADS label + qBT · IDLE meta when torrents is undefined', () => {
      render(<DashboardSystemWidget />)
      expect(screen.getByText('> NO ACTIVE DOWNLOADS')).toBeInTheDocument()
      expect(screen.getByText('qBT · IDLE')).toBeInTheDocument()
    })

    it('renders zero state when torrents is empty array', () => {
      render(<DashboardSystemWidget torrents={[]} />)
      expect(screen.getByText('> NO ACTIVE DOWNLOADS')).toBeInTheDocument()
      expect(screen.getByText('qBT · IDLE')).toBeInTheDocument()
    })

    it('does not render any progress bars in zero state', () => {
      render(<DashboardSystemWidget torrents={[]} />)
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    })

    it('applies dsw-zero class in zero state', () => {
      const { container } = render(<DashboardSystemWidget />)
      const widget = container.querySelector('.dsw')
      expect(widget).toHaveClass('dsw-zero')
    })
  })

  describe('active state', () => {
    const torrents = [
      { id: 't1', name: 'fight.club.1999.1080p.mkv', progress: 42.3 },
      { id: 't2', name: 'memento.2000.bluray.mkv', progress: 87.5 },
    ]

    it('renders > ACTIVE DOWNLOADS header with throughput', () => {
      render(<DashboardSystemWidget torrents={torrents} throughput='3.2 MB/s' />)
      expect(screen.getByText('> ACTIVE DOWNLOADS · 3.2 MB/s')).toBeInTheDocument()
    })

    it('renders one row per torrent with rounded percentage', () => {
      render(<DashboardSystemWidget torrents={torrents} throughput='3.2 MB/s' />)
      expect(screen.getByText('fight.club.1999.1080p.mkv')).toBeInTheDocument()
      expect(screen.getByText('memento.2000.bluray.mkv')).toBeInTheDocument()
      expect(screen.getByText('42%')).toBeInTheDocument()
      expect(screen.getByText('88%')).toBeInTheDocument()
    })

    it('renders a PhosphorBar progressbar per torrent', () => {
      render(<DashboardSystemWidget torrents={torrents} throughput='3.2 MB/s' />)
      const bars = screen.getAllByRole('progressbar')
      expect(bars).toHaveLength(2)
      expect(bars[0]).toHaveAttribute('aria-valuenow', '42.3')
      expect(bars[1]).toHaveAttribute('aria-valuenow', '87.5')
    })

    it('does not append the · separator when throughput is null', () => {
      render(<DashboardSystemWidget torrents={torrents} throughput={null} />)
      expect(screen.getByText('> ACTIVE DOWNLOADS')).toBeInTheDocument()
      expect(screen.queryByText(/ACTIVE DOWNLOADS ·/)).not.toBeInTheDocument()
    })

    it('does not append the · separator when throughput is an empty string', () => {
      render(<DashboardSystemWidget torrents={torrents} throughput='' />)
      expect(screen.getByText('> ACTIVE DOWNLOADS')).toBeInTheDocument()
      expect(screen.queryByText(/ACTIVE DOWNLOADS ·/)).not.toBeInTheDocument()
    })

    it('does NOT render the right-side meta span in active state (AC-2)', () => {
      const { container } = render(
        <DashboardSystemWidget torrents={torrents} throughput='3.2 MB/s' />,
      )
      expect(container.querySelector('.dsw-meta')).toBeNull()
    })

    it('omits dsw-zero class in active state', () => {
      const { container } = render(
        <DashboardSystemWidget torrents={torrents} throughput='3.2 MB/s' />,
      )
      const widget = container.querySelector('.dsw')
      expect(widget).not.toHaveClass('dsw-zero')
    })

    it('clamps NaN progress to 0%', () => {
      render(
        <DashboardSystemWidget
          torrents={[{ id: 't1', name: 'bad.mkv', progress: Number.NaN }]}
          throughput='1 MB/s'
        />,
      )
      expect(screen.getByText('0%')).toBeInTheDocument()
      const bar = screen.getByRole('progressbar')
      expect(bar).toHaveAttribute('aria-valuenow', '0')
    })

    it('clamps negative progress to 0%', () => {
      render(
        <DashboardSystemWidget
          torrents={[{ id: 't1', name: 'bad.mkv', progress: -42 }]}
          throughput='1 MB/s'
        />,
      )
      expect(screen.getByText('0%')).toBeInTheDocument()
    })

    it('clamps progress above 100 to 100%', () => {
      render(
        <DashboardSystemWidget
          torrents={[{ id: 't1', name: 'done.mkv', progress: 142 }]}
          throughput='1 MB/s'
        />,
      )
      expect(screen.getByText('100%')).toBeInTheDocument()
    })
  })
})
