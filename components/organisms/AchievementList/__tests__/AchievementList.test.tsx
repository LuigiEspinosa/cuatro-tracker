import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  AchievementList,
  type AchievementListItem,
} from '../AchievementList'

function makeItem(
  overrides: Partial<AchievementListItem> & { id: string },
): AchievementListItem {
  return {
    steam_api_name: overrides.id,
    display_name: overrides.id,
    description: null,
    icon_url: null,
    unlocked: false,
    unlocked_at: null,
    percent_global: null,
    ...overrides,
  }
}

const MIXED: AchievementListItem[] = [
  makeItem({
    id: 'a1',
    display_name: 'Rare Unlocked',
    unlocked: true,
    unlocked_at: new Date('2024-03-15T08:00:00Z'),
    percent_global: 5,
  }),
  makeItem({
    id: 'a2',
    display_name: 'Uncommon Unlocked',
    unlocked: true,
    percent_global: 25,
  }),
  makeItem({
    id: 'a3',
    display_name: 'Common Locked',
    unlocked: false,
    percent_global: 75,
  }),
  makeItem({
    id: 'a4',
    display_name: 'Clamped Locked',
    unlocked: false,
    percent_global: 100,
  }),
  makeItem({
    id: 'a5',
    display_name: 'Unknown Locked',
    unlocked: false,
    percent_global: null,
  }),
]

describe('AchievementList', () => {
  it('derives rarity chips from percent_global at the documented breakpoints', () => {
    render(<AchievementList achievements={MIXED} gameId='game-1' />)
    expect(screen.getByText('RARE')).toBeInTheDocument()
    expect(screen.getByText('UNCOMMON')).toBeInTheDocument()
    // 75 and the >= 100 soft-clamp both resolve to COMMON.
    expect(screen.getAllByText('COMMON')).toHaveLength(2)
  })

  it('soft-clamps percent_global >= 100 to COMMON and renders no chip when null', () => {
    render(<AchievementList achievements={MIXED} gameId='game-1' />)
    expect(screen.getByText('Clamped Locked').closest('li')).toHaveAttribute(
      'data-rarity',
      'common',
    )
    const unknownRow = screen.getByText('Unknown Locked').closest('li')
    expect(unknownRow).toHaveAttribute('data-rarity', 'none')
    expect(unknownRow?.textContent).not.toMatch(/RARE|UNCOMMON|COMMON/)
  })

  it('groups unlocked rows under UNLOCKED and locked rows under LOCKED', () => {
    const { container } = render(
      <AchievementList achievements={MIXED} gameId='game-1' />,
    )
    const unlockedSection = container.querySelector("[data-state='unlocked']")
    const lockedSection = container.querySelector("[data-state='locked']")
    expect(unlockedSection).toHaveTextContent('Rare Unlocked')
    expect(unlockedSection).toHaveTextContent('Uncommon Unlocked')
    expect(unlockedSection).not.toHaveTextContent('Common Locked')
    expect(lockedSection).toHaveTextContent('Common Locked')
    expect(lockedSection).toHaveTextContent('Unknown Locked')
    expect(lockedSection).not.toHaveTextContent('Rare Unlocked')
  })

  it('drives the PhosphorBar from unlocked count over total', () => {
    render(<AchievementList achievements={MIXED} gameId='game-1' />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '2')
    expect(bar).toHaveAttribute('aria-valuemax', '5')
  })

  it('renders the summary line and formats unlocked dates as YYYY-MM-DD (UTC)', () => {
    const { container } = render(
      <AchievementList achievements={MIXED} gameId='game-1' />,
    )
    expect(container.querySelector('.achievement-list-summary')).toHaveTextContent(
      '2 / 5 · 40%',
    )
    expect(screen.getByText('2024-03-15')).toBeInTheDocument()
  })

  it('renders an empty-state row and no PhosphorBar for an empty list', () => {
    render(<AchievementList achievements={[]} gameId='game-1' />)
    expect(
      screen.getByText(/NO ACHIEVEMENTS FOR THIS GAME/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})
