import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MediaType, WatchStatus } from '@prisma/client'
import { MediaCardOverlay } from '@/components/molecules/MediaCardOverlay'

describe('MediaCardOverlay', () => {
  it('renders title + meta + status for a fully populated movie', () => {
    render(
      <MediaCardOverlay
        title='Fight Club'
        year={1999}
        mediaType={MediaType.MOVIE}
        status={WatchStatus.WATCHING}
      />,
    )
    expect(screen.getByText('Fight Club')).toBeInTheDocument()
    expect(screen.getByText('MOVIE · 1999')).toBeInTheDocument()
    expect(screen.getByText('WATCHING')).toBeInTheDocument()
  })

  it('omits the year when null (sentinel 1970 → API returns null)', () => {
    render(
      <MediaCardOverlay
        title='Unknown Release'
        year={null}
        mediaType={MediaType.MOVIE}
        status={WatchStatus.PLAN_TO_WATCH}
      />,
    )
    expect(screen.getByText('MOVIE')).toBeInTheDocument()
    expect(screen.queryByText(/·/)).toBeNull()
  })

  it('uses the per-medium type label', () => {
    const cases: Array<[MediaType, string]> = [
      [MediaType.TV_SHOW, 'TV · 2024'],
      [MediaType.ANIME, 'ANIME · 2024'],
      [MediaType.MANGA, 'MANGA · 2024'],
      [MediaType.GAME, 'GAME · 2024'],
    ]
    for (const [mediaType, expected] of cases) {
      const { unmount } = render(
        <MediaCardOverlay
          title='Sample'
          year={2024}
          mediaType={mediaType}
          status={WatchStatus.COMPLETED}
        />,
      )
      expect(screen.getByText(expected)).toBeInTheDocument()
      unmount()
    }
  })

  it('exposes the status as a data-status attribute for CSS color targeting', () => {
    const cases: Array<[WatchStatus, string, string]> = [
      [WatchStatus.PLAN_TO_WATCH, 'plan_to_watch', 'PLAN TO WATCH'],
      [WatchStatus.WATCHING, 'watching', 'WATCHING'],
      [WatchStatus.COMPLETED, 'completed', 'COMPLETED'],
      [WatchStatus.ON_HOLD, 'on_hold', 'ON HOLD'],
      [WatchStatus.DROPPED, 'dropped', 'DROPPED'],
    ]
    for (const [status, dataValue, label] of cases) {
      const { container, unmount } = render(
        <MediaCardOverlay
          title='Sample'
          year={2024}
          mediaType={MediaType.MOVIE}
          status={status}
        />,
      )
      const statusEl = container.querySelector('.media-card-overlay-status')
      expect(statusEl?.getAttribute('data-status')).toBe(dataValue)
      expect(statusEl?.textContent).toBe(label)
      unmount()
    }
  })
})
