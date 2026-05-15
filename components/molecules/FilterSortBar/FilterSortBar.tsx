'use client'

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from 'react'
import { WatchStatus } from '@prisma/client'
import { FilterChip } from '@/components/molecules/FilterChip'

export type LibraryMedium = 'movies' | 'tv' | 'anime' | 'manga' | 'games'

export type LifecycleFilter = 'in_progress' | 'continuing' | 'ended'

export type FilterSearchHandle = {
  focus: () => void
}

export type SortOption = {
  key: string
  label: string
}

export type FilterSortBarProps = {
  medium: LibraryMedium
  search: string
  onSearchChange: (next: string) => void
  activeStatus: WatchStatus | null
  onStatusChange: (next: WatchStatus | null) => void
  activeSort: string
  sortOptions: SortOption[]
  onSortChange: (next: string) => void
  hasScrolled?: boolean
  searchRef?: Ref<FilterSearchHandle>
  debounceMs?: number
  // TV-only lifecycle filter chip group. Ignored for non-TV mediums.
  activeLifecycle?: LifecycleFilter | null
  onLifecycleChange?: (next: LifecycleFilter | null) => void
}

const STATUS_CHIPS: ReadonlyArray<{ status: WatchStatus; label: string }> = [
  { status: WatchStatus.PLAN_TO_WATCH, label: 'PLAN TO WATCH' },
  { status: WatchStatus.WATCHING, label: 'WATCHING' },
  { status: WatchStatus.COMPLETED, label: 'COMPLETED' },
  { status: WatchStatus.ON_HOLD, label: 'ON HOLD' },
  { status: WatchStatus.DROPPED, label: 'DROPPED' },
]

const LIFECYCLE_CHIPS: ReadonlyArray<{ key: LifecycleFilter; label: string }> = [
  { key: 'in_progress', label: 'IN PROGRESS' },
  { key: 'continuing', label: 'CONTINUING' },
  { key: 'ended', label: 'ENDED' },
]

const PLACEHOLDER_BY_MEDIUM: Record<LibraryMedium, string> = {
  movies: 'FILTER MOVIES…',
  tv: 'FILTER TV SHOWS…',
  anime: 'FILTER ANIME…',
  manga: 'FILTER MANGA…',
  games: 'FILTER GAMES…',
}

export function FilterSortBar({
  medium,
  search,
  onSearchChange,
  activeStatus,
  onStatusChange,
  activeSort,
  sortOptions,
  onSortChange,
  hasScrolled = false,
  searchRef,
  debounceMs = 150,
  activeLifecycle = null,
  onLifecycleChange,
}: FilterSortBarProps) {
  const [sortOpen, setSortOpen] = useState(false)
  const [draft, setDraft] = useState(search)
  const sortRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const sortPanelId = useId()
  const activeSortLabel =
    sortOptions.find((o) => o.key === activeSort)?.label ?? activeSort.toUpperCase()

  // Expose focus() to parent so F or / keys can refocus the input.
  useImperativeHandle(searchRef, () => ({ focus: () => inputRef.current?.focus() }), [])

  // Sync draft when parent forces a value change (e.g. Escape clears externally).
  useEffect(() => {
    setDraft(search)
  }, [search])

  // Pin onSearchChange in a ref so the debounce timer is not re-scheduled when
  // callers pass a non-stable function identity.
  const onSearchChangeRef = useRef(onSearchChange)
  useEffect(() => {
    onSearchChangeRef.current = onSearchChange
  })

  // Debounced flush.
  useEffect(() => {
    if (draft === search) return
    const timer = setTimeout(() => {
      onSearchChangeRef.current(draft)
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [draft, search, debounceMs])

  const closeSort = useCallback(() => setSortOpen(false), [])

  useEffect(() => {
    if (!sortOpen) return
    function handler(e: MouseEvent | KeyboardEvent) {
      if (e instanceof KeyboardEvent) {
        if (e.key === 'Escape') closeSort()
        return
      }
      if (!sortRef.current) return
      if (!(e.target instanceof Node)) return
      if (!sortRef.current.contains(e.target)) closeSort()
    }
    window.addEventListener('click', handler)
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('keydown', handler)
    }
  }, [sortOpen, closeSort])

  return (
    <div
      className='filter-sort-bar'
      data-has-scrolled={hasScrolled ? 'true' : 'false'}
    >
      <div className='filter-sort-bar-search'>
        <span className='filter-sort-bar-search-caret' aria-hidden='true'>
          &gt;
        </span>
        <input
          ref={inputRef}
          type='search'
          className='filter-sort-bar-search-input'
          value={draft}
          placeholder={PLACEHOLDER_BY_MEDIUM[medium]}
          aria-label='Filter library'
          autoComplete='off'
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && draft !== '') {
              e.preventDefault()
              setDraft('')
              onSearchChangeRef.current('')
            }
          }}
        />
      </div>
      <div
        className='filter-sort-bar-chips'
        role='group'
        aria-label='Filter by status'
      >
        {STATUS_CHIPS.map((chip) => (
          <FilterChip
            key={chip.status}
            active={activeStatus === chip.status}
            label={chip.label}
            onToggle={() =>
              onStatusChange(activeStatus === chip.status ? null : chip.status)
            }
          />
        ))}
      </div>
      {medium === 'tv' && onLifecycleChange ? (
        <div
          className='filter-sort-bar-chips filter-sort-bar-chips-lifecycle'
          role='group'
          aria-label='Filter by lifecycle'
        >
          {LIFECYCLE_CHIPS.map((chip) => (
            <FilterChip
              key={chip.key}
              active={activeLifecycle === chip.key}
              label={chip.label}
              onToggle={() =>
                onLifecycleChange(
                  activeLifecycle === chip.key ? null : chip.key,
                )
              }
            />
          ))}
        </div>
      ) : null}
      <div className='filter-sort-bar-sort' ref={sortRef}>
        <button
          type='button'
          className='filter-sort-bar-sort-trigger'
          aria-haspopup='listbox'
          aria-expanded={sortOpen}
          aria-controls={sortPanelId}
          onClick={(e) => {
            e.stopPropagation()
            setSortOpen((v) => !v)
          }}
        >
          <span className='filter-sort-bar-sort-label'>SORT BY:</span>
          <span className='filter-sort-bar-sort-value'>{activeSortLabel}</span>
          <span className='filter-sort-bar-sort-chev' aria-hidden='true' />
        </button>
        {sortOpen ? (
          <ul
            id={sortPanelId}
            className='filter-sort-bar-sort-panel'
            role='listbox'
            aria-label='Sort options'
          >
            {sortOptions.map((opt) => (
              <li
                key={opt.key}
                role='option'
                aria-selected={opt.key === activeSort}
                className='filter-sort-bar-sort-option'
                data-active={opt.key === activeSort ? 'true' : 'false'}
                onClick={() => {
                  onSortChange(opt.key)
                  closeSort()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSortChange(opt.key)
                    closeSort()
                  }
                }}
                tabIndex={0}
              >
                {opt.label}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  )
}
