import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WatchStatus } from '@prisma/client'
import {
  SeasonAccordion,
  type SeasonGroup,
} from '@/components/molecules/SeasonAccordion'

function seasons(): SeasonGroup[] {
  return [
    {
      number: 1,
      episodes: [
        {
          mediaItemId: 's1e1',
          seasonNumber: 1,
          episodeNumber: 1,
          title: 'Pilot',
          airDate: '2008-01-20T00:00:00Z',
          runtime: 47,
          unaired: false,
          status: WatchStatus.COMPLETED,
        },
        {
          mediaItemId: 's1e2',
          seasonNumber: 1,
          episodeNumber: 2,
          title: "Cat's in the Bag...",
          airDate: '2008-01-27T00:00:00Z',
          runtime: 48,
          unaired: false,
          status: WatchStatus.PLAN_TO_WATCH,
        },
      ],
    },
    {
      number: 2,
      episodes: [
        {
          mediaItemId: 's2e1',
          seasonNumber: 2,
          episodeNumber: 1,
          title: 'Seven Thirty-Seven',
          airDate: '2009-03-08T00:00:00Z',
          runtime: 47,
          unaired: false,
          status: WatchStatus.PLAN_TO_WATCH,
        },
      ],
    },
  ]
}

describe('SeasonAccordion', () => {
  it('renders all season headers (collapsed by default when defaultExpandedSeason is null)', () => {
    render(
      <SeasonAccordion
        seasons={seasons()}
        defaultExpandedSeason={null}
        onToggleEpisode={vi.fn()}
        onMarkSeasonWatched={vi.fn()}
      />,
    )
    expect(screen.getByText('SEASON 1')).toBeInTheDocument()
    expect(screen.getByText('SEASON 2')).toBeInTheDocument()
    // Episode titles only render in the expanded panel.
    expect(screen.queryByText('Pilot')).toBeNull()
  })

  it('expands the defaultExpandedSeason on initial render', () => {
    render(
      <SeasonAccordion
        seasons={seasons()}
        defaultExpandedSeason={1}
        onToggleEpisode={vi.fn()}
        onMarkSeasonWatched={vi.fn()}
      />,
    )
    expect(screen.getByText('Pilot')).toBeInTheDocument()
    expect(screen.getByText("Cat's in the Bag...")).toBeInTheDocument()
    // Season 2 panel is still collapsed.
    expect(screen.queryByText('Seven Thirty-Seven')).toBeNull()
  })

  it('toggles a season open/closed on header click', () => {
    render(
      <SeasonAccordion
        seasons={seasons()}
        defaultExpandedSeason={null}
        onToggleEpisode={vi.fn()}
        onMarkSeasonWatched={vi.fn()}
      />,
    )
    const s1Header = screen.getByText('SEASON 1').closest('button')!
    fireEvent.click(s1Header)
    expect(screen.getByText('Pilot')).toBeInTheDocument()
    fireEvent.click(s1Header)
    expect(screen.queryByText('Pilot')).toBeNull()
  })

  it('fires onToggleEpisode with the next status when an episode checkbox is clicked', () => {
    const onToggle = vi.fn()
    render(
      <SeasonAccordion
        seasons={seasons()}
        defaultExpandedSeason={1}
        onToggleEpisode={onToggle}
        onMarkSeasonWatched={vi.fn()}
      />,
    )
    // S1E1 is COMPLETED → toggling sends PLAN_TO_WATCH
    const s1e1Box = screen.getByRole('checkbox', {
      name: 'Mark Pilot watched',
    })
    fireEvent.click(s1e1Box)
    expect(onToggle).toHaveBeenCalledWith('s1e1', WatchStatus.PLAN_TO_WATCH)
  })

  it('fires onMarkSeasonWatched when the per-season button is clicked', () => {
    const onMark = vi.fn()
    render(
      <SeasonAccordion
        seasons={seasons()}
        defaultExpandedSeason={1}
        onToggleEpisode={vi.fn()}
        onMarkSeasonWatched={onMark}
      />,
    )
    const mark = screen.getByRole('button', { name: /MARK SEASON WATCHED/ })
    fireEvent.click(mark)
    expect(onMark).toHaveBeenCalledWith(1)
  })

  it('renders SPECIALS label for season 0', () => {
    render(
      <SeasonAccordion
        seasons={[
          {
            number: 0,
            episodes: [
              {
                mediaItemId: 'special-1',
                seasonNumber: 0,
                episodeNumber: 1,
                title: 'Behind the scenes',
                airDate: '2008-01-20T00:00:00Z',
                runtime: 30,
                unaired: false,
                status: WatchStatus.PLAN_TO_WATCH,
              },
            ],
          },
        ]}
        defaultExpandedSeason={null}
        onToggleEpisode={vi.fn()}
        onMarkSeasonWatched={vi.fn()}
      />,
    )
    expect(screen.getByText('SPECIALS')).toBeInTheDocument()
  })

  it('renders UNAIRED chip + disabled checkbox for unaired episodes', () => {
    render(
      <SeasonAccordion
        seasons={[
          {
            number: 1,
            episodes: [
              {
                mediaItemId: 'unaired-1',
                seasonNumber: 1,
                episodeNumber: 99,
                title: 'Future Episode',
                airDate: null,
                runtime: null,
                unaired: true,
                status: null,
              },
            ],
          },
        ]}
        defaultExpandedSeason={1}
        onToggleEpisode={vi.fn()}
        onMarkSeasonWatched={vi.fn()}
      />,
    )
    expect(screen.getByText('UNAIRED')).toBeInTheDocument()
    const box = screen.getByRole('checkbox', {
      name: 'Mark Future Episode watched',
      hidden: true,
    })
    expect(box.getAttribute('aria-disabled')).toBe('true')
  })
})
