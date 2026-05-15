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

  it('renders inline PhosphorBar + progress label when progressLabel + progressPct are both set (Story 7.4)', () => {
    render(
      <MediaCardOverlay
        title='Breaking Bad'
        year={2008}
        mediaType={MediaType.TV_SHOW}
        status={WatchStatus.WATCHING}
        progressLabel='S2E4 / 10'
        progressPct={30}
      />,
    )
    expect(screen.getByText('S2E4 / 10')).toBeInTheDocument()
    // The overlay is aria-hidden (decorative); accessible name query needs
    // the hidden flag to reach the progressbar inside.
    const bar = screen.getByRole('progressbar', { hidden: true })
    expect(bar.getAttribute('aria-valuenow')).toBe('30')
    expect(bar.getAttribute('aria-valuemax')).toBe('100')
  })

  it('does NOT render the progress block when progressLabel is null', () => {
    const { container } = render(
      <MediaCardOverlay
        title='Breaking Bad'
        year={2008}
        mediaType={MediaType.TV_SHOW}
        status={WatchStatus.PLAN_TO_WATCH}
        progressLabel={null}
        progressPct={null}
      />,
    )
    expect(container.querySelector('.media-card-overlay-progress')).toBeNull()
    expect(screen.queryByRole('progressbar', { hidden: true })).toBeNull()
  })

  it('does NOT render progress when progressPct is non-finite (defensive)', () => {
    const { container } = render(
      <MediaCardOverlay
        title='Sample'
        year={2024}
        mediaType={MediaType.TV_SHOW}
        status={WatchStatus.WATCHING}
        progressLabel='S1E1 / 10'
        progressPct={Number.NaN}
      />,
    )
    expect(container.querySelector('.media-card-overlay-progress')).toBeNull()
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
