import { beforeEach, describe, expect, it } from 'vitest'
import type { MediaType, WatchStatus } from '@prisma/client'
import {
  ALL_MEDIA_TYPES,
  ALL_WATCH_STATUSES,
  DEFAULT_SORT_MODE,
  parseTimelineParams,
  serializeTimelineState,
  useTimelineStore,
  type TimelineSnapshot,
} from '@/store/timeline'

function sortedValues<T>(set: Set<T>): T[] {
  return [...set].sort()
}

beforeEach(() => {
  useTimelineStore.getState().reset()
})

describe('useTimelineStore state and actions', () => {
  it('initializes with the documented defaults', () => {
    const state = useTimelineStore.getState()
    expect(state.sortMode).toBe(DEFAULT_SORT_MODE)
    expect(state.sortMode).toBe('release_desc')
    expect(state.mediaTypes.size).toBe(6)
    expect(sortedValues(state.mediaTypes)).toEqual(
      sortedValues(new Set(ALL_MEDIA_TYPES)),
    )
    expect(state.statuses.size).toBe(5)
    expect(sortedValues(state.statuses)).toEqual(
      sortedValues(new Set(ALL_WATCH_STATUSES)),
    )
    expect(state.franchiseMode).toBe(false)
  })

  it('setSortMode changes the sort mode', () => {
    useTimelineStore.getState().setSortMode('consumed_asc')
    expect(useTimelineStore.getState().sortMode).toBe('consumed_asc')
  })

  it('toggleMediaType adds when absent, removes when present, new ref each call', () => {
    const before = useTimelineStore.getState().mediaTypes
    expect(before.has('MOVIE')).toBe(true)

    useTimelineStore.getState().toggleMediaType('MOVIE')
    const afterRemove = useTimelineStore.getState().mediaTypes
    expect(afterRemove).not.toBe(before)
    expect(afterRemove.has('MOVIE')).toBe(false)
    // The original Set is untouched: the toggle replaced the reference, it did
    // not mutate in place.
    expect(before.has('MOVIE')).toBe(true)

    useTimelineStore.getState().toggleMediaType('MOVIE')
    const afterAdd = useTimelineStore.getState().mediaTypes
    expect(afterAdd).not.toBe(afterRemove)
    expect(afterAdd.has('MOVIE')).toBe(true)
  })

  it('toggleStatus adds when absent, removes when present, new ref each call', () => {
    const before = useTimelineStore.getState().statuses
    expect(before.has('WATCHING')).toBe(true)

    useTimelineStore.getState().toggleStatus('WATCHING')
    const afterRemove = useTimelineStore.getState().statuses
    expect(afterRemove).not.toBe(before)
    expect(afterRemove.has('WATCHING')).toBe(false)

    useTimelineStore.getState().toggleStatus('WATCHING')
    const afterAdd = useTimelineStore.getState().statuses
    expect(afterAdd).not.toBe(afterRemove)
    expect(afterAdd.has('WATCHING')).toBe(true)
  })

  it('setFranchiseMode sets true then false', () => {
    useTimelineStore.getState().setFranchiseMode(true)
    expect(useTimelineStore.getState().franchiseMode).toBe(true)
    useTimelineStore.getState().setFranchiseMode(false)
    expect(useTimelineStore.getState().franchiseMode).toBe(false)
  })

  it('reset restores defaults with fresh Set instances', () => {
    const store = useTimelineStore.getState()
    store.setSortMode('added_asc')
    store.toggleMediaType('MOVIE')
    store.toggleStatus('WATCHING')
    store.setFranchiseMode(true)

    store.reset()
    const afterFirstReset = useTimelineStore.getState()
    expect(afterFirstReset.sortMode).toBe('release_desc')
    expect(afterFirstReset.mediaTypes.size).toBe(6)
    expect(afterFirstReset.statuses.size).toBe(5)
    expect(afterFirstReset.franchiseMode).toBe(false)

    // A fresh Set each reset: mutating the post-reset set must not bleed into
    // the next reset.
    const firstResetSet = useTimelineStore.getState().mediaTypes
    useTimelineStore.getState().toggleMediaType('MOVIE')
    useTimelineStore.getState().reset()
    const secondResetSet = useTimelineStore.getState().mediaTypes
    expect(secondResetSet).not.toBe(firstResetSet)
    expect(secondResetSet.size).toBe(6)
  })

  it('hydrateFromParams applies parsed params and replaces the Sets', () => {
    const before = useTimelineStore.getState().mediaTypes
    useTimelineStore
      .getState()
      .hydrateFromParams(
        new URLSearchParams('sort=release_asc&types=movie&statuses=completed'),
      )
    const state = useTimelineStore.getState()
    expect(state.sortMode).toBe('release_asc')
    expect(sortedValues(state.mediaTypes)).toEqual(['MOVIE'])
    expect(sortedValues(state.statuses)).toEqual(['COMPLETED'])
    expect(state.mediaTypes).not.toBe(before)
    expect(state.franchiseMode).toBe(false)
  })
})

describe('parseTimelineParams', () => {
  it('parses a full happy-path query string', () => {
    const snapshot = parseTimelineParams(
      new URLSearchParams(
        'sort=consumed_asc&types=movie,game&statuses=watching,completed&franchise=1',
      ),
    )
    expect(snapshot.sortMode).toBe('consumed_asc')
    expect(sortedValues(snapshot.mediaTypes)).toEqual(['GAME', 'MOVIE'])
    expect(sortedValues(snapshot.statuses)).toEqual(['COMPLETED', 'WATCHING'])
    expect(snapshot.franchiseMode).toBe(true)
  })

  it('falls back to defaults on empty, malformed, and all-invalid params', () => {
    expect(
      parseTimelineParams(new URLSearchParams('statuses=')).statuses.size,
    ).toBe(5)
    expect(
      parseTimelineParams(new URLSearchParams('sort=garbage')).sortMode,
    ).toBe('release_desc')
    expect(
      parseTimelineParams(new URLSearchParams('types=foo,bar')).mediaTypes.size,
    ).toBe(6)
    expect(
      sortedValues(
        parseTimelineParams(new URLSearchParams('types=movie,bogus,game'))
          .mediaTypes,
      ),
    ).toEqual(['GAME', 'MOVIE'])
    expect(parseTimelineParams(new URLSearchParams('')).franchiseMode).toBe(
      false,
    )
    expect(
      parseTimelineParams(new URLSearchParams('franchise=0')).franchiseMode,
    ).toBe(false)
  })
})

describe('serializeTimelineState', () => {
  it('serializes a fully-default snapshot to zero params', () => {
    const snapshot: TimelineSnapshot = {
      sortMode: DEFAULT_SORT_MODE,
      mediaTypes: new Set(ALL_MEDIA_TYPES),
      statuses: new Set(ALL_WATCH_STATUSES),
      franchiseMode: false,
    }
    expect(serializeTimelineState(snapshot).toString()).toBe('')
  })

  it('omits default dimensions and emits lowercase tokens for the rest', () => {
    const snapshot: TimelineSnapshot = {
      sortMode: 'consumed_desc',
      mediaTypes: new Set<MediaType>(['MOVIE', 'GAME']),
      statuses: new Set(ALL_WATCH_STATUSES),
      franchiseMode: true,
    }
    const params = serializeTimelineState(snapshot)
    expect(params.get('sort')).toBe('consumed_desc')
    expect(params.get('types')).toBe('movie,game')
    expect(params.has('statuses')).toBe(false)
    expect(params.get('franchise')).toBe('1')
  })
})

describe('serialize/parse round-trip', () => {
  it('parseTimelineParams(serializeTimelineState(snapshot)) deep-equals the input', () => {
    const snapshots: TimelineSnapshot[] = [
      {
        sortMode: DEFAULT_SORT_MODE,
        mediaTypes: new Set(ALL_MEDIA_TYPES),
        statuses: new Set(ALL_WATCH_STATUSES),
        franchiseMode: false,
      },
      {
        sortMode: 'release_asc',
        mediaTypes: new Set<MediaType>(['MOVIE']),
        statuses: new Set(ALL_WATCH_STATUSES),
        franchiseMode: false,
      },
      {
        sortMode: 'added_asc',
        mediaTypes: new Set<MediaType>(['ANIME', 'MANGA']),
        statuses: new Set<WatchStatus>(['WATCHING', 'DROPPED']),
        franchiseMode: true,
      },
    ]
    for (const snapshot of snapshots) {
      const round = parseTimelineParams(serializeTimelineState(snapshot))
      expect(round.sortMode).toBe(snapshot.sortMode)
      expect(sortedValues(round.mediaTypes)).toEqual(
        sortedValues(snapshot.mediaTypes),
      )
      expect(sortedValues(round.statuses)).toEqual(
        sortedValues(snapshot.statuses),
      )
      expect(round.franchiseMode).toBe(snapshot.franchiseMode)
    }
  })
})
