import { create } from 'zustand'
import type { MediaType, WatchStatus } from '@prisma/client'
import type { SortMode } from '@/lib/timeline'

export const DEFAULT_SORT_MODE: SortMode = 'release_desc'

export const ALL_MEDIA_TYPES = [
  'MOVIE',
  'TV_SHOW',
  'TV_EPISODE',
  'ANIME',
  'MANGA',
  'GAME',
] as const satisfies readonly MediaType[]

export const ALL_WATCH_STATUSES = [
  'PLAN_TO_WATCH',
  'WATCHING',
  'COMPLETED',
  'ON_HOLD',
  'DROPPED',
] as const satisfies readonly WatchStatus[]

const SORT_MODES = [
  'release_asc',
  'release_desc',
  'consumed_asc',
  'consumed_desc',
  'added_asc',
] as const satisfies readonly SortMode[]

// The three arrays above are hand-maintained mirrors of the Prisma enums and
// the SortMode union (a type-only import keeps the Prisma runtime out of this
// client bundle). AssertTrue rejects a false argument, so if any source type
// gains a member that is not mirrored into its array, the matching alias stops
// compiling: a forgotten update becomes a build error rather than a silently
// shrunken default filter set. Type-only, erased at runtime.
type AssertTrue<T extends true> = T
type _MediaTypesCovered = AssertTrue<
  MediaType extends (typeof ALL_MEDIA_TYPES)[number] ? true : false
>
type _WatchStatusesCovered = AssertTrue<
  WatchStatus extends (typeof ALL_WATCH_STATUSES)[number] ? true : false
>
type _SortModesCovered = AssertTrue<
  SortMode extends (typeof SORT_MODES)[number] ? true : false
>

export type TimelineSnapshot = {
  sortMode: SortMode
  mediaTypes: Set<MediaType>
  statuses: Set<WatchStatus>
  franchiseMode: boolean
}

function isSortMode(value: string): value is SortMode {
  return (SORT_MODES as readonly string[]).includes(value)
}

function serializeTokens<T extends string>(
  order: readonly T[],
  active: Set<T>,
): string {
  return order
    .filter((value) => active.has(value))
    .map((value) => value.toLowerCase())
    .join(',')
}

function parseTokens<T extends string>(
  raw: string | null,
  all: readonly T[],
): Set<T> {
  if (raw === null) return new Set(all)
  const allowed = all as readonly string[]
  const parsed = raw
    .split(',')
    .map((token) => token.trim().toUpperCase())
    .filter((token): token is T => allowed.includes(token))
  return parsed.length > 0 ? new Set(parsed) : new Set(all)
}

export function serializeTimelineState(
  snapshot: TimelineSnapshot,
): URLSearchParams {
  const params = new URLSearchParams()
  if (snapshot.sortMode !== DEFAULT_SORT_MODE) {
    params.set('sort', snapshot.sortMode)
  }
  if (snapshot.mediaTypes.size !== ALL_MEDIA_TYPES.length) {
    params.set('types', serializeTokens(ALL_MEDIA_TYPES, snapshot.mediaTypes))
  }
  if (snapshot.statuses.size !== ALL_WATCH_STATUSES.length) {
    params.set(
      'statuses',
      serializeTokens(ALL_WATCH_STATUSES, snapshot.statuses),
    )
  }
  if (snapshot.franchiseMode) {
    params.set('franchise', '1')
  }
  return params
}

export function parseTimelineParams(params: URLSearchParams): TimelineSnapshot {
  const rawSort = params.get('sort')
  return {
    sortMode:
      rawSort !== null && isSortMode(rawSort) ? rawSort : DEFAULT_SORT_MODE,
    mediaTypes: parseTokens(params.get('types'), ALL_MEDIA_TYPES),
    statuses: parseTokens(params.get('statuses'), ALL_WATCH_STATUSES),
    franchiseMode: params.get('franchise') === '1',
  }
}

function defaultSnapshot(): TimelineSnapshot {
  return {
    sortMode: DEFAULT_SORT_MODE,
    mediaTypes: new Set(ALL_MEDIA_TYPES),
    statuses: new Set(ALL_WATCH_STATUSES),
    franchiseMode: false,
  }
}

type TimelineStore = TimelineSnapshot & {
  setSortMode: (mode: SortMode) => void
  toggleMediaType: (type: MediaType) => void
  toggleStatus: (status: WatchStatus) => void
  setFranchiseMode: (on: boolean) => void
  reset: () => void
  hydrateFromParams: (params: URLSearchParams) => void
}

export const useTimelineStore = create<TimelineStore>((set) => ({
  ...defaultSnapshot(),
  setSortMode: (mode) => set({ sortMode: mode }),
  toggleMediaType: (type) =>
    set((state) => {
      // ! Replace the Set reference, never mutate in place. Zustand re-renders
      // ! subscribers on reference change, so an in-place add/delete would
      // ! update the data without re-rendering the UI.
      const next = new Set(state.mediaTypes)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return { mediaTypes: next }
    }),
  toggleStatus: (status) =>
    set((state) => {
      const next = new Set(state.statuses)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      return { statuses: next }
    }),
  setFranchiseMode: (on) => set({ franchiseMode: on }),
  reset: () => set(defaultSnapshot()),
  hydrateFromParams: (params) => set(parseTimelineParams(params)),
}))
