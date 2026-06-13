import { isReleaseDateUnknown } from '@/lib/normalise/release-date'

// * The five canonical timeline sort modes per FR24. Stories 10.3 (store) and
// * 10.6 (filter strip) import this union, they do not redeclare it.
export type SortMode =
  | 'release_asc'
  | 'release_desc'
  | 'consumed_asc'
  | 'consumed_desc'
  | 'added_asc'

export type TimelineEntry = {
  // UserEntry.id, stable and unique, the deterministic tie-breaker in every mode
  id: string
  // MediaItem.release_date, non-null per schema and NFR13 (sentinel when unknown)
  release_date: Date
  // UserEntry.completed_at, null while the item is not yet consumed
  completed_at: Date | null
  // UserEntry.created_at (NOT MediaItem.created_at)
  created_at: Date
}

export type YearGroup<T extends TimelineEntry = TimelineEntry> = {
  year: number | null
  entries: T[]
}

function primaryDate(entry: TimelineEntry, mode: SortMode): Date | null {
  switch (mode) {
    case 'release_asc':
    case 'release_desc':
      return entry.release_date
    case 'consumed_asc':
    case 'consumed_desc':
      return entry.completed_at
    case 'added_asc':
      return entry.created_at
  }
}

function byId(a: TimelineEntry, b: TimelineEntry): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

export function sortTimeline<T extends TimelineEntry>(
  entries: T[],
  mode: SortMode,
): T[] {
  const descending = mode === 'release_desc' || mode === 'consumed_desc'
  const out = [...entries]
  out.sort((a, b) => {
    const dateA = primaryDate(a, mode)
    const dateB = primaryDate(b, mode)
    // ! Null sort fields always sink to the end, in ascending AND descending
    // ! modes. Descending must never float unconsumed entries to the top.
    if (dateA === null && dateB === null) return byId(a, b)
    if (dateA === null) return 1
    if (dateB === null) return -1
    const diff = descending
      ? dateB.getTime() - dateA.getTime()
      : dateA.getTime() - dateB.getTime()
    return diff === 0 ? byId(a, b) : diff
  })
  return out
}

// * Contract: entries must already be sorted by sortTimeline with this same
// * mode. Grouping only chunks consecutive runs, it never re-sorts, so a
// * mismatched mode fragments the year groups (Story 10.4 derives both calls
// * from one store.sortMode).
export function groupByYear<T extends TimelineEntry>(
  entries: T[],
  mode: SortMode,
): YearGroup<T>[] {
  const groups: YearGroup<T>[] = []
  for (const entry of entries) {
    // Sentinel releases are undatable and stay off the timeline in every mode.
    if (isReleaseDateUnknown(entry.release_date)) continue
    const date = primaryDate(entry, mode)
    // * getUTCFullYear, never getFullYear: stored dates are UTC-anchored and a
    // * local-time read would shift year buckets by machine timezone.
    const year = date === null ? null : date.getUTCFullYear()
    const current = groups[groups.length - 1]
    if (current !== undefined && current.year === year) {
      current.entries.push(entry)
    } else {
      groups.push({ year, entries: [entry] })
    }
  }
  return groups
}
