import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EpisodeChecklist } from '@/components/molecules/EpisodeChecklist'

describe('EpisodeChecklist', () => {
  it('renders 1..N rows for the given episodeCount', () => {
    render(
      <EpisodeChecklist
        mediaItemId='anime-1'
        episodeCount={4}
        progress={0}
        onToggleEpisode={vi.fn()}
      />,
    )
    expect(screen.getByText('EP 1')).toBeInTheDocument()
    expect(screen.getByText('EP 2')).toBeInTheDocument()
    expect(screen.getByText('EP 3')).toBeInTheDocument()
    expect(screen.getByText('EP 4')).toBeInTheDocument()
    expect(screen.queryByText('EP 5')).not.toBeInTheDocument()
  })

  it('marks rows where n <= progress as checked, rows where n > progress as unchecked', () => {
    render(
      <EpisodeChecklist
        mediaItemId='anime-1'
        episodeCount={5}
        progress={3}
        onToggleEpisode={vi.fn()}
      />,
    )
    const toggles = screen.getAllByRole('checkbox')
    expect(toggles).toHaveLength(5)
    expect(toggles[0]?.getAttribute('aria-checked')).toBe('true') // EP 1
    expect(toggles[1]?.getAttribute('aria-checked')).toBe('true') // EP 2
    expect(toggles[2]?.getAttribute('aria-checked')).toBe('true') // EP 3
    expect(toggles[3]?.getAttribute('aria-checked')).toBe('false') // EP 4
    expect(toggles[4]?.getAttribute('aria-checked')).toBe('false') // EP 5
  })

  it('fires onToggleEpisode with n and nextChecked=true when clicking an unwatched row', () => {
    const onToggle = vi.fn()
    render(
      <EpisodeChecklist
        mediaItemId='anime-1'
        episodeCount={3}
        progress={1}
        onToggleEpisode={onToggle}
      />,
    )
    // Click EP 3 (currently unwatched).
    const ep3 = screen.getByRole('checkbox', { name: 'Mark episode 3 watched' })
    fireEvent.click(ep3)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith(3, true)
  })

  it('fires onToggleEpisode with n and nextChecked=false when clicking a watched row', () => {
    const onToggle = vi.fn()
    render(
      <EpisodeChecklist
        mediaItemId='anime-1'
        episodeCount={5}
        progress={5}
        onToggleEpisode={onToggle}
      />,
    )
    // Click EP 5 (currently watched).
    const ep5 = screen.getByRole('checkbox', { name: 'Mark episode 5 watched' })
    fireEvent.click(ep5)
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith(5, false)
  })

  it('renders nothing when episodeCount is 0', () => {
    const { container } = render(
      <EpisodeChecklist
        mediaItemId='anime-1'
        episodeCount={0}
        progress={0}
        onToggleEpisode={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('exposes mediaItemId via a data attribute (for e2e + analytics selectors)', () => {
    render(
      <EpisodeChecklist
        mediaItemId='anime-frieren'
        episodeCount={2}
        progress={1}
        onToggleEpisode={vi.fn()}
      />,
    )
    const list = screen.getByRole('list')
    expect(list.getAttribute('data-media-item-id')).toBe('anime-frieren')
  })
})
