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
  // MediaItem.franchise_id, the franchise-mode grouping key (and, until a
  // normalized Franchise table lands, the display label). null = ungrouped.
  franchise_id: string | null
  // ! Present ONLY on a synthetic franchise summary row (groupByFranchise);
  // ! it carries that franchise's child rows for expand-on-click. Same word as
  // ! YearGroup.entries (a year's rows) but a different shape, do not conflate.
  entries?: TimelineEntry[]
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

// * Collapses entries sharing a franchise_id into one synthetic summary row
// * whose children ride in `entries`. Input MUST already be sorted by
// * sortTimeline with the active mode. The synthetic inherits the ANCHOR member
// * (earliest release_date, id tie-break) and is emitted AT the anchor's array
// * slot, so dropping the other members leaves the list sorted and groupByYear
// * chunks it correctly with no second sort. Pure: never mutates the input rows.
// * Failure mode: emitting the synthetic at the first-seen member's slot strands
// * it under release_desc (the default sort), where first-seen is the newest
// * member but the synthetic's date is the oldest, so groupByYear mis-buckets it
// * and a franchise's year can surface twice.
// * Roads not taken: collapse-then-resort is also correct but adds a redundant
// * sort and reorders the AC's stated sortTimeline to groupByFranchise to
// * groupByYear pipeline.
export function groupByFranchise<T extends TimelineEntry>(entries: T[]): T[] {
  // Bucket array indices by franchise_id. A null or blank id never groups.
  const groups = new Map<string, number[]>()
  entries.forEach((entry, index) => {
    if (!entry.franchise_id) return
    const list = groups.get(entry.franchise_id)
    if (list === undefined) groups.set(entry.franchise_id, [index])
    else list.push(index)
  })

  // For each franchise with two or more members, precompute the synthetic to
  // drop at the anchor slot and mark the rest for removal. A single-member
  // franchise passes through untouched (a one-row franchise is visual noise).
  const syntheticAt = new Map<number, T>()
  const dropped = new Set<number>()
  for (const indices of groups.values()) {
    if (indices.length < 2) continue
    const members = indices.map((index) => entries[index])
    const children = [...members].sort((a, b) => {
      const diff = a.release_date.getTime() - b.release_date.getTime()
      return diff !== 0 ? diff : byId(a, b)
    })
    const anchor = children[0]
    const anchorIndex = indices[members.indexOf(anchor)]
    syntheticAt.set(anchorIndex, { ...anchor, entries: children })
    for (const index of indices) if (index !== anchorIndex) dropped.add(index)
  }

  // Rebuild in the original (already-sorted) order: swap the anchor for the
  // synthetic, skip the dropped members, pass everything else through.
  const out: T[] = []
  entries.forEach((entry, index) => {
    if (dropped.has(index)) return
    out.push(syntheticAt.get(index) ?? entry)
  })
  return out
}

// * Era ground-tint mapping (Story 10.5). Six era bands separated by five decade
// * boundaries (1980 / 1990 / 2000 / 2010 / 2020); pre-1980 is the open-ended
// * floor and the 2020s band equals --ground-base. Returns a token NAME, never a
// * hex: the six --ground-* values live in app/tokens.css and the tint driver
// * resolves them at runtime, so the palette stays single-sourced. Ported
// * verbatim from the Story 10.1 design bundle eraForYear thresholds.
export type EraToken =
  | '--ground-pre-1980'
  | '--ground-1980s'
  | '--ground-1990s'
  | '--ground-2000s'
  | '--ground-2010s'
  | '--ground-2020s'

export function eraTokenForYear(year: number): EraToken {
  if (year < 1980) return '--ground-pre-1980'
  if (year < 1990) return '--ground-1980s'
  if (year < 2000) return '--ground-1990s'
  if (year < 2010) return '--ground-2000s'
  if (year < 2020) return '--ground-2010s'
  return '--ground-2020s'
}
