import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { WatchStatus } from '@prisma/client'
import {
  FilterSortBar,
  type SortOption,
} from '@/components/molecules/FilterSortBar'

const SORT_OPTIONS: SortOption[] = [
  { key: 'recently_added', label: 'RECENTLY ADDED' },
  { key: 'title_asc', label: 'TITLE A-Z' },
  { key: 'release_date_desc', label: 'RELEASE DATE' },
]

function setup(overrides: Partial<React.ComponentProps<typeof FilterSortBar>> = {}) {
  const onSearchChange = vi.fn()
  const onStatusChange = vi.fn()
  const onSortChange = vi.fn()
  const utils = render(
    <FilterSortBar
      medium='movies'
      search=''
      onSearchChange={onSearchChange}
      activeStatus={null}
      onStatusChange={onStatusChange}
      activeSort='recently_added'
      sortOptions={SORT_OPTIONS}
      onSortChange={onSortChange}
      {...overrides}
    />,
  )
  return { ...utils, onSearchChange, onStatusChange, onSortChange }
}

describe('FilterSortBar', () => {
  it('renders the 5 status chips', () => {
    setup()
    expect(screen.getByText('PLAN TO WATCH')).toBeInTheDocument()
    expect(screen.getByText('WATCHING')).toBeInTheDocument()
    expect(screen.getByText('COMPLETED')).toBeInTheDocument()
    expect(screen.getByText('ON HOLD')).toBeInTheDocument()
    expect(screen.getByText('DROPPED')).toBeInTheDocument()
  })

  it('renders the medium-specific search placeholder', () => {
    setup({ medium: 'tv' })
    expect(screen.getByPlaceholderText('FILTER TV SHOWS…')).toBeInTheDocument()
  })

  it('toggles status filter from null to WATCHING on chip click', () => {
    const { onStatusChange } = setup()
    fireEvent.click(screen.getByText('WATCHING'))
    expect(onStatusChange).toHaveBeenCalledWith(WatchStatus.WATCHING)
  })

  it('clears status filter when clicking the currently-active chip', () => {
    const { onStatusChange } = setup({ activeStatus: WatchStatus.WATCHING })
    fireEvent.click(screen.getByText('WATCHING'))
    expect(onStatusChange).toHaveBeenCalledWith(null)
  })

  it('opens the sort dropdown panel on trigger click', () => {
    setup()
    const trigger = screen.getByRole('button', { name: /SORT BY/ })
    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getByText('TITLE A-Z')).toBeInTheDocument()
  })

  it('fires onSortChange and closes the panel when a sort option is clicked', () => {
    const { onSortChange } = setup()
    const trigger = screen.getByRole('button', { name: /SORT BY/ })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByText('TITLE A-Z'))
    expect(onSortChange).toHaveBeenCalledWith('title_asc')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('displays the active sort label inline in the trigger', () => {
    setup({ activeSort: 'title_asc' })
    expect(screen.getByText('TITLE A-Z')).toBeInTheDocument()
  })

  it('reflects has-scrolled state via data attribute for the bottom rainbow rule', () => {
    const { container, rerender } = setup({ hasScrolled: false })
    const bar = container.querySelector('.filter-sort-bar')
    expect(bar?.getAttribute('data-has-scrolled')).toBe('false')

    rerender(
      <FilterSortBar
        medium='movies'
        search=''
        onSearchChange={() => {}}
        activeStatus={null}
        onStatusChange={() => {}}
        activeSort='recently_added'
        sortOptions={SORT_OPTIONS}
        onSortChange={() => {}}
        hasScrolled
      />,
    )
    expect(bar?.getAttribute('data-has-scrolled')).toBe('true')
  })

  it('closes the sort panel on Escape key', () => {
    setup()
    const trigger = screen.getByRole('button', { name: /SORT BY/ })
    fireEvent.click(trigger)
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  describe('lifecycle chips (TV-only, Story 7.4)', () => {
    it('does NOT render lifecycle chips for non-TV mediums', () => {
      setup({ medium: 'movies', onLifecycleChange: vi.fn() })
      expect(screen.queryByText('IN PROGRESS')).toBeNull()
      expect(screen.queryByText('CONTINUING')).toBeNull()
      expect(screen.queryByText('ENDED')).toBeNull()
    })

    it('renders 3 lifecycle chips when medium=tv and onLifecycleChange is wired', () => {
      setup({ medium: 'tv', onLifecycleChange: vi.fn() })
      expect(screen.getByText('IN PROGRESS')).toBeInTheDocument()
      expect(screen.getByText('CONTINUING')).toBeInTheDocument()
      expect(screen.getByText('ENDED')).toBeInTheDocument()
    })

    it('hides lifecycle chips when medium=tv but onLifecycleChange is undefined', () => {
      setup({ medium: 'tv' })
      expect(screen.queryByText('IN PROGRESS')).toBeNull()
    })

    it('fires onLifecycleChange("continuing") when the continuing chip is clicked', () => {
      const onLifecycleChange = vi.fn()
      setup({ medium: 'tv', onLifecycleChange })
      fireEvent.click(screen.getByText('CONTINUING'))
      expect(onLifecycleChange).toHaveBeenCalledWith('continuing')
    })

    it('toggles off the lifecycle filter when clicking the currently-active chip', () => {
      const onLifecycleChange = vi.fn()
      setup({
        medium: 'tv',
        onLifecycleChange,
        activeLifecycle: 'continuing',
      })
      fireEvent.click(screen.getByText('CONTINUING'))
      expect(onLifecycleChange).toHaveBeenCalledWith(null)
    })
  })
})
