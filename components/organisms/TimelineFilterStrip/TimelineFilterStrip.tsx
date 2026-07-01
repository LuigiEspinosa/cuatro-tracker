'use client'

// Client organism: it reads and writes the Zustand timeline store, owns the
// roving keyboard focus across the chip groups and the sort radiogroup, and
// holds the SearchInput focus ref the F / / page shortcuts target. All of that
// needs the browser. No motion libraries (NFR26): the only animation is the
// CSS-only sort underline, gated under prefers-reduced-motion in global.css.

import {
  useEffect,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { MediaType, WatchStatus } from '@prisma/client'
import { FilterChip } from '@/components/molecules/FilterChip'
import { SearchInput, type SearchInputHandle } from '@/components/molecules/SearchInput'
import { ALL_WATCH_STATUSES, useTimelineStore } from '@/store/timeline'
import type { SortMode } from '@/lib/timeline'

export type TimelineFilterStripProps = {
  // True when the library is empty: the strip renders greyed and inert so it
  // stays visually present beside the LIBRARY EMPTY card without inviting input.
  disabled?: boolean
}

// The five display chips. TV_EPISODE has no chip because findTimelineEntries
// excludes episode rows from the dataset, so the timeline never sees that type;
// the TV chip maps to TV_SHOW. TV_EPISODE stays harmlessly in the store default.
const MEDIA_CHIPS: ReadonlyArray<{ type: MediaType; label: string }> = [
  { type: 'MOVIE', label: 'MOVIES' },
  { type: 'TV_SHOW', label: 'TV' },
  { type: 'ANIME', label: 'ANIME' },
  { type: 'MANGA', label: 'MANGA' },
  { type: 'GAME', label: 'GAMES' },
]

const STATUS_LABELS: Record<WatchStatus, string> = {
  PLAN_TO_WATCH: 'PLAN TO WATCH',
  WATCHING: 'WATCHING',
  COMPLETED: 'COMPLETED',
  ON_HOLD: 'ON HOLD',
  DROPPED: 'DROPPED',
}

// Canonical display order + truthful labels (D9: added_asc is ascending, oldest
// added first, so ADDED up). The active option carries the 6-band rainbow
// underline (AC-2). There is no added_desc, the SortMode union rejects it.
const SORT_OPTIONS: ReadonlyArray<{ mode: SortMode; label: string }> = [
  { mode: 'release_desc', label: 'RELEASE ↓' },
  { mode: 'release_asc', label: 'RELEASE ↑' },
  { mode: 'consumed_desc', label: 'CONSUMED ↓' },
  { mode: 'consumed_asc', label: 'CONSUMED ↑' },
  { mode: 'added_asc', label: 'ADDED ↑' },
]

type ChipDescriptor = {
  key: string
  label: string
  active: boolean
  onToggle: () => void
}

// A multi-select chip group as a single tab stop (roving tabindex). Exactly one
// chip is tabbable; ArrowLeft/Right (and Up/Down/Home/End) move focus within the
// group. Enter/Space ride the native button click, which runs onToggle.
function ChipGroup({
  ariaLabel,
  chips,
  disabled,
}: {
  ariaLabel: string
  chips: ReadonlyArray<ChipDescriptor>
  disabled: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const safeFocused = focusedIndex < chips.length ? focusedIndex : 0

  function moveFocus(nextIndex: number) {
    setFocusedIndex(nextIndex)
    const buttons =
      containerRef.current?.querySelectorAll<HTMLButtonElement>('.filter-chip')
    buttons?.[nextIndex]?.focus()
  }

  // Keep the roving tab stop aligned with real focus. A mouse click (or any
  // focus that did not come from the arrow keys) moves DOM focus without
  // touching focusedIndex, so without this the next arrow press would resume
  // from a stale index and jump to a non-adjacent chip.
  function syncFocus(event: ReactFocusEvent<HTMLDivElement>) {
    const buttons =
      containerRef.current?.querySelectorAll<HTMLButtonElement>('.filter-chip')
    if (!buttons) return
    const focused = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '.filter-chip',
    )
    const index = focused ? Array.from(buttons).indexOf(focused) : -1
    if (index >= 0) setFocusedIndex(index)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (chips.length === 0) return
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        moveFocus((safeFocused + 1) % chips.length)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        moveFocus((safeFocused - 1 + chips.length) % chips.length)
        break
      case 'Home':
        event.preventDefault()
        moveFocus(0)
        break
      case 'End':
        event.preventDefault()
        moveFocus(chips.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div
      ref={containerRef}
      className='tl-strip-group'
      role='group'
      aria-label={ariaLabel}
      onFocusCapture={syncFocus}
      onKeyDown={handleKeyDown}
    >
      {chips.map((chip, index) => (
        <FilterChip
          key={chip.key}
          active={chip.active}
          label={chip.label}
          onToggle={chip.onToggle}
          tabIndex={index === safeFocused ? 0 : -1}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

// The 5 sort modes as a radiogroup with one tab stop. Arrow keys move focus
// (not selection, mirroring the chip groups per AC-5); Enter/Space on the
// focused radio rides the native click to select. The active radio's underline
// is always rendered and scaled in via CSS so the rainbow can transition.
function SortRadioGroup({
  value,
  onChange,
  disabled,
}: {
  value: SortMode
  onChange: (mode: SortMode) => void
  disabled: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const activeIndex = SORT_OPTIONS.findIndex((option) => option.mode === value)
  const [focusedIndex, setFocusedIndex] = useState(activeIndex < 0 ? 0 : activeIndex)

  // Realign the tab stop with the active mode when it changes elsewhere (RESET,
  // a deep link, the select below). Arrowing to a non-active radio leaves the
  // active mode untouched, so this effect does not fight in-group navigation.
  useEffect(() => {
    if (activeIndex >= 0) setFocusedIndex(activeIndex)
  }, [activeIndex])

  function moveFocus(nextIndex: number) {
    setFocusedIndex(nextIndex)
    const radios =
      containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    radios?.[nextIndex]?.focus()
  }

  // Keep the roving tab stop aligned with real focus (mouse click, Tab) so the
  // next arrow press continues from the focused radio, not a stale index.
  function syncFocus(event: ReactFocusEvent<HTMLDivElement>) {
    const radios =
      containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    if (!radios) return
    const focused = (event.target as HTMLElement).closest<HTMLButtonElement>(
      '[role="radio"]',
    )
    const index = focused ? Array.from(radios).indexOf(focused) : -1
    if (index >= 0) setFocusedIndex(index)
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        moveFocus((focusedIndex + 1) % SORT_OPTIONS.length)
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        moveFocus((focusedIndex - 1 + SORT_OPTIONS.length) % SORT_OPTIONS.length)
        break
      case 'Home':
        event.preventDefault()
        moveFocus(0)
        break
      case 'End':
        event.preventDefault()
        moveFocus(SORT_OPTIONS.length - 1)
        break
      default:
        break
    }
  }

  return (
    <div
      ref={containerRef}
      className='tl-sort'
      role='radiogroup'
      aria-label='Sort timeline'
      onFocusCapture={syncFocus}
      onKeyDown={handleKeyDown}
    >
      {SORT_OPTIONS.map((option, index) => {
        const checked = option.mode === value
        return (
          <button
            key={option.mode}
            type='button'
            role='radio'
            aria-checked={checked}
            className='tl-sort-option'
            data-active={checked ? 'true' : 'false'}
            tabIndex={index === focusedIndex ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.mode)}
          >
            <span className='tl-sort-label'>{option.label}</span>
            <span className='tl-sort-underline' aria-hidden='true' />
          </button>
        )
      })}
    </div>
  )
}

export function TimelineFilterStrip({ disabled = false }: TimelineFilterStripProps) {
  const {
    sortMode,
    mediaTypes,
    statuses,
    franchiseMode,
    titleQuery,
    setSortMode,
    toggleMediaType,
    toggleStatus,
    setFranchiseMode,
    setTitleQuery,
    reset,
  } = useTimelineStore(
    useShallow((s) => ({
      sortMode: s.sortMode,
      mediaTypes: s.mediaTypes,
      statuses: s.statuses,
      franchiseMode: s.franchiseMode,
      titleQuery: s.titleQuery,
      setSortMode: s.setSortMode,
      toggleMediaType: s.toggleMediaType,
      toggleStatus: s.toggleStatus,
      setFranchiseMode: s.setFranchiseMode,
      setTitleQuery: s.setTitleQuery,
      reset: s.reset,
    })),
  )

  const searchRef = useRef<SearchInputHandle | null>(null)
  const stripRef = useRef<HTMLDivElement | null>(null)

  // Page shortcuts: F or / focuses search, Escape resets. Both are suppressed
  // while the user is typing in a field (so an "f" keystroke or an in-search
  // Escape, which SearchInput itself clears, is never hijacked).
  useEffect(() => {
    if (disabled) return
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (isTyping) return
      if (event.key === 'Escape') {
        // The destructive reset fires only from outside the strip (review
        // option c): a focused chip, radio, franchise toggle, or timeline row
        // link no longer wipes every filter on Escape. An in-field Escape is
        // owned by SearchInput, already short-circuited by isTyping above.
        if (target instanceof Node && stripRef.current?.contains(target)) return
        reset()
        return
      }
      if (event.key === 'f' || event.key === 'F' || event.key === '/') {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [disabled, reset])

  // * Failure mode: a multi-select group toggled down to zero would render a
  // * timeline with no rows and no obvious cause. D10 keeps the last active chip
  // * locked on. The guard lives here, not in toggleMediaType/toggleStatus, so
  // * the store keeps its blind-toggle contract (and the Story 10.3 tests).
  // ! Count active VISIBLE chips, not mediaTypes.size: TV_EPISODE is a permanent
  // ! chip-less member of the store default, so a size-based guard lets the fifth
  // ! visible chip toggle off at size 2 and strands the timeline on {TV_EPISODE}.
  const activeMediaChipCount = MEDIA_CHIPS.filter((chip) =>
    mediaTypes.has(chip.type),
  ).length
  const mediaChips: ChipDescriptor[] = MEDIA_CHIPS.map((chip) => ({
    key: chip.type,
    label: chip.label,
    active: mediaTypes.has(chip.type),
    onToggle: () => {
      if (mediaTypes.has(chip.type) && activeMediaChipCount === 1) return
      toggleMediaType(chip.type)
    },
  }))

  const statusChips: ChipDescriptor[] = ALL_WATCH_STATUSES.map((status) => ({
    key: status,
    label: STATUS_LABELS[status],
    active: statuses.has(status),
    onToggle: () => {
      if (statuses.has(status) && statuses.size === 1) return
      toggleStatus(status)
    },
  }))

  return (
    <div
      className='tl-strip'
      data-disabled={disabled ? 'true' : 'false'}
      ref={stripRef}
    >
      <div className='tl-strip-inner'>
        <ChipGroup
          ariaLabel='Filter by media type'
          chips={mediaChips}
          disabled={disabled}
        />
        <span className='tl-strip-divider' aria-hidden='true' />
        <ChipGroup
          ariaLabel='Filter by watch status'
          chips={statusChips}
          disabled={disabled}
        />
        <span className='tl-strip-divider' aria-hidden='true' />
        <SortRadioGroup value={sortMode} onChange={setSortMode} disabled={disabled} />
        <span className='tl-strip-divider' aria-hidden='true' />
        <button
          type='button'
          className='tl-franchise'
          aria-pressed={franchiseMode}
          disabled={disabled}
          onClick={() => setFranchiseMode(!franchiseMode)}
        >
          <span
            className='tl-franchise-dot'
            data-on={franchiseMode ? 'true' : 'false'}
            aria-hidden='true'
          />
          <span className='tl-franchise-label'>FRANCHISE</span>
        </button>
        <div className='tl-strip-search'>
          <SearchInput
            ref={searchRef}
            value={titleQuery}
            onChange={setTitleQuery}
            debounceMs={200}
            placeholder='FILTER TIMELINE…'
            disabled={disabled}
          />
        </div>
        <button
          type='button'
          className='tl-reset'
          disabled={disabled}
          onClick={reset}
        >
          &gt; RESET
        </button>
      </div>
    </div>
  )
}
