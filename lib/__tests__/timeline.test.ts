import { describe, it, expect } from 'vitest'
import { RELEASE_DATE_SENTINEL } from '@/lib/normalise/release-date'
import {
  eraTokenForYear,
  groupByFranchise,
  groupByYear,
  sortTimeline,
  type SortMode,
  type TimelineEntry,
} from '@/lib/timeline'

// 1-based month so fixture rows read like calendar dates
const utc = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day))

const entry = (
  id: string,
  release_date: Date,
  completed_at: Date | null,
  created_at: Date,
): TimelineEntry => ({ id, release_date, completed_at, created_at, franchise_id: null })

const sentinel = new Date(RELEASE_DATE_SENTINEL)

// * 20 mixed entries (movies, episodes, games are shape-identical here, the
// * functions read only the four sortable fields). Deliberate collisions:
// * release ties e07/e08, e13/e14, e19/e20; consumed ties e01/e11, e03/e05;
// * created tie e11/e14. e03 carries the release-date sentinel, e04 is a
// * genuine 1970 release that must never be treated as the sentinel.
const fixture: TimelineEntry[] = [
  entry('e01', utc(1999, 12, 31), utc(2024, 1, 10), utc(2024, 1, 20)),
  entry('e02', utc(2000, 1, 1), null, utc(2024, 1, 3)),
  entry('e03', sentinel, utc(2024, 2, 20), utc(2024, 1, 15)),
  entry('e04', utc(1970, 6, 15), null, utc(2024, 1, 8)),
  entry('e05', utc(1985, 7, 3), utc(2024, 2, 20), utc(2024, 1, 1)),
  entry('e06', utc(1994, 9, 10), utc(2023, 11, 5), utc(2024, 1, 12)),
  entry('e07', utc(2001, 3, 22), null, utc(2024, 1, 19)),
  entry('e08', utc(2001, 3, 22), utc(2024, 3, 15), utc(2024, 1, 5)),
  entry('e09', utc(2008, 11, 18), utc(2022, 6, 30), utc(2024, 1, 16)),
  entry('e10', utc(2010, 5, 14), null, utc(2024, 1, 2)),
  entry('e11', utc(2010, 8, 27), utc(2024, 1, 10), utc(2024, 1, 9)),
  entry('e12', utc(2012, 12, 1), utc(2021, 4, 12), utc(2024, 1, 18)),
  entry('e13', utc(2015, 2, 9), null, utc(2024, 1, 6)),
  entry('e14', utc(2015, 2, 9), utc(2023, 7, 19), utc(2024, 1, 9)),
  entry('e15', utc(2018, 10, 5), utc(2025, 5, 1), utc(2024, 1, 11)),
  entry('e16', utc(2019, 4, 26), utc(2020, 9, 17), utc(2024, 1, 4)),
  entry('e17', utc(2020, 9, 17), null, utc(2024, 1, 14)),
  entry('e18', utc(2021, 6, 11), utc(2024, 8, 23), utc(2024, 1, 7)),
  entry('e19', utc(2023, 3, 30), utc(2019, 12, 31), utc(2024, 1, 17)),
  entry('e20', utc(2023, 3, 30), null, utc(2024, 1, 13)),
]

const ids = (entries: readonly TimelineEntry[]) => entries.map((e) => e.id)

const RELEASE_ASC = [
  'e03',
  'e04',
  'e05',
  'e06',
  'e01',
  'e02',
  'e07',
  'e08',
  'e09',
  'e10',
  'e11',
  'e12',
  'e13',
  'e14',
  'e15',
  'e16',
  'e17',
  'e18',
  'e19',
  'e20',
]

const RELEASE_DESC = [
  'e19',
  'e20',
  'e18',
  'e17',
  'e16',
  'e15',
  'e13',
  'e14',
  'e12',
  'e11',
  'e10',
  'e09',
  'e07',
  'e08',
  'e02',
  'e01',
  'e06',
  'e05',
  'e04',
  'e03',
]

const CONSUMED_ASC = [
  'e19',
  'e16',
  'e12',
  'e09',
  'e14',
  'e06',
  'e01',
  'e11',
  'e03',
  'e05',
  'e08',
  'e18',
  'e15',
  'e02',
  'e04',
  'e07',
  'e10',
  'e13',
  'e17',
  'e20',
]

const CONSUMED_DESC = [
  'e15',
  'e18',
  'e08',
  'e03',
  'e05',
  'e01',
  'e11',
  'e06',
  'e14',
  'e09',
  'e12',
  'e16',
  'e19',
  'e02',
  'e04',
  'e07',
  'e10',
  'e13',
  'e17',
  'e20',
]

const ADDED_ASC = [
  'e05',
  'e10',
  'e02',
  'e16',
  'e08',
  'e13',
  'e18',
  'e04',
  'e11',
  'e14',
  'e15',
  'e06',
  'e20',
  'e17',
  'e03',
  'e09',
  'e19',
  'e12',
  'e07',
  'e01',
]

// The 7 entries with completed_at null, in id order (the consumed-mode tail)
const NULL_COMPLETED_TAIL = ['e02', 'e04', 'e07', 'e10', 'e13', 'e17', 'e20']

describe('sortTimeline', () => {
  it('release_asc orders by release_date ascending with id tie-breaks', () => {
    expect(ids(sortTimeline(fixture, 'release_asc'))).toEqual(RELEASE_ASC)
  })

  it('release_desc orders by release_date descending, ties still id ascending', () => {
    expect(ids(sortTimeline(fixture, 'release_desc'))).toEqual(RELEASE_DESC)
  })

  it('consumed_asc orders by completed_at ascending with nulls last', () => {
    expect(ids(sortTimeline(fixture, 'consumed_asc'))).toEqual(CONSUMED_ASC)
  })

  it('consumed_desc orders by completed_at descending with nulls last', () => {
    expect(ids(sortTimeline(fixture, 'consumed_desc'))).toEqual(CONSUMED_DESC)
  })

  it('added_asc orders by created_at ascending with id tie-breaks', () => {
    expect(ids(sortTimeline(fixture, 'added_asc'))).toEqual(ADDED_ASC)
  })

  it('sinks null completed_at entries to the end in both consumed directions', () => {
    expect(ids(sortTimeline(fixture, 'consumed_asc')).slice(13)).toEqual(
      NULL_COMPLETED_TAIL,
    )
    expect(ids(sortTimeline(fixture, 'consumed_desc')).slice(13)).toEqual(
      NULL_COMPLETED_TAIL,
    )
  })

  it('breaks ties by id ascending regardless of input insertion order', () => {
    const reversed = [...fixture].reverse()
    expect(ids(sortTimeline(reversed, 'release_asc'))).toEqual(RELEASE_ASC)
    expect(ids(sortTimeline(reversed, 'consumed_desc'))).toEqual(CONSUMED_DESC)
    expect(ids(sortTimeline(reversed, 'added_asc'))).toEqual(ADDED_ASC)
  })

  it('returns a new array holding the same member objects', () => {
    const sorted = sortTimeline(fixture, 'release_asc')
    expect(sorted).not.toBe(fixture)
    expect(sorted[0]).toBe(fixture[2])
  })

  it('passes rich row objects through unchanged (generic over TimelineEntry)', () => {
    const rich = [
      {
        ...entry('r2', utc(2002, 1, 1), null, utc(2024, 1, 2)),
        title: 'Beta',
      },
      {
        ...entry('r1', utc(2001, 1, 1), null, utc(2024, 1, 1)),
        title: 'Alpha',
      },
    ]
    const sorted = sortTimeline(rich, 'release_asc')
    expect(sorted.map((e) => e.title)).toEqual(['Alpha', 'Beta'])
    expect(sorted[0]).toBe(rich[1])
    const grouped = groupByYear(sorted, 'release_asc')
    expect(grouped[0]?.entries[0]?.title).toBe('Alpha')
  })

  it('returns an empty array for empty input', () => {
    expect(sortTimeline([], 'release_asc')).toEqual([])
  })
})

describe('groupByYear', () => {
  it('chunks a pre-sorted 3-year range into 3 groups in input order', () => {
    const threeYears: TimelineEntry[] = [
      entry('t1', utc(2001, 5, 1), null, utc(2024, 1, 1)),
      entry('t2', utc(2001, 8, 9), null, utc(2024, 1, 2)),
      entry('t3', utc(2002, 2, 2), null, utc(2024, 1, 3)),
      entry('t4', utc(2003, 12, 24), null, utc(2024, 1, 4)),
    ]
    const groups = groupByYear(threeYears, 'release_asc').map((g) => ({
      year: g.year,
      ids: ids(g.entries),
    }))
    expect(groups).toEqual([
      { year: 2001, ids: ['t1', 't2'] },
      { year: 2002, ids: ['t3'] },
      { year: 2003, ids: ['t4'] },
    ])
  })

  it('excludes sentinel-release entries from every group, in every mode', () => {
    const releaseGroups = groupByYear(
      sortTimeline(fixture, 'release_asc'),
      'release_asc',
    )
    const releaseIds = releaseGroups.flatMap((g) => ids(g.entries))
    expect(releaseIds).not.toContain('e03')
    expect(releaseIds).toHaveLength(fixture.length - 1)

    // The sentinel check always targets release_date: e03 has a perfectly
    // valid completed_at and is still excluded in consumed mode.
    const consumedGroups = groupByYear(
      sortTimeline(fixture, 'consumed_asc'),
      'consumed_asc',
    )
    const consumedIds = consumedGroups.flatMap((g) => ids(g.entries))
    expect(consumedIds).not.toContain('e03')
    expect(consumedIds).toHaveLength(fixture.length - 1)
  })

  it('keeps a genuine 1970 release (sentinel match is exact, not a year test)', () => {
    const groups = groupByYear(
      sortTimeline(fixture, 'release_asc'),
      'release_asc',
    )
    expect(groups[0]?.year).toBe(1970)
    expect(ids(groups[0]?.entries ?? [])).toEqual(['e04'])
  })

  it('collects null completed_at entries into one trailing year null group', () => {
    const groups = groupByYear(
      sortTimeline(fixture, 'consumed_asc'),
      'consumed_asc',
    )
    const last = groups[groups.length - 1]
    expect(last?.year).toBeNull()
    expect(ids(last?.entries ?? [])).toEqual(NULL_COMPLETED_TAIL)
    expect(groups.filter((g) => g.year === null)).toHaveLength(1)
  })

  it('preserves the input order and never re-sorts', () => {
    const sorted = sortTimeline(fixture, 'release_desc')
    const groups = groupByYear(sorted, 'release_desc')
    expect(groups.map((g) => g.year)).toEqual([
      2023, 2021, 2020, 2019, 2018, 2015, 2012, 2010, 2008, 2001, 2000, 1999,
      1994, 1985, 1970,
    ])
    expect(ids(groups.flatMap((g) => g.entries))).toEqual(
      ids(sorted).filter((id) => id !== 'e03'),
    )
  })

  it('buckets years by UTC so boundary dates are timezone-independent', () => {
    const groups = groupByYear(
      sortTimeline(fixture, 'release_asc'),
      'release_asc',
    )
    const yearOf = (id: string) =>
      groups.find((g) => g.entries.some((e) => e.id === id))?.year
    // e02 is 2000-01-01T00:00:00Z: a local-time read west of UTC would
    // misbucket it into 1999.
    expect(yearOf('e02')).toBe(2000)
    expect(yearOf('e01')).toBe(1999)
  })

  it('returns an empty array for empty input', () => {
    expect(groupByYear([], 'consumed_desc')).toEqual([])
  })
})

describe('groupByFranchise', () => {
  const fe = (
    id: string,
    release_date: Date,
    franchise_id: string | null,
  ): TimelineEntry => ({
    id,
    release_date,
    completed_at: null,
    created_at: utc(2024, 1, 1),
    franchise_id,
  })

  it('collapses a 3-entry franchise into one synthetic anchored to the earliest release (AC-2)', () => {
    const mix = [
      fe('f-2015', utc(2015, 6, 1), 'saga'),
      fe('f-2010', utc(2010, 6, 1), 'saga'),
      fe('f-2012', utc(2012, 6, 1), 'saga'),
    ]
    const collapsed = groupByFranchise(sortTimeline(mix, 'release_asc'))
    expect(collapsed).toHaveLength(1)
    const synthetic = collapsed[0]
    // Anchored to the earliest member: it carries the 2010 entry's id + date.
    expect(synthetic?.id).toBe('f-2010')
    expect(synthetic?.release_date).toEqual(utc(2010, 6, 1))
    // Children are all three members, sorted by release date ascending.
    expect(synthetic?.entries?.map((e) => e.id)).toEqual([
      'f-2010',
      'f-2012',
      'f-2015',
    ])
  })

  it('lands the collapsed franchise in the earliest year group via the full pipeline (AC-2)', () => {
    const mix = [
      fe('f-2015', utc(2015, 6, 1), 'saga'),
      fe('f-2010', utc(2010, 6, 1), 'saga'),
      fe('f-2012', utc(2012, 6, 1), 'saga'),
    ]
    const mode: SortMode = 'release_asc'
    const groups = groupByYear(groupByFranchise(sortTimeline(mix, mode)), mode)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.year).toBe(2010)
    expect(ids(groups[0]?.entries ?? [])).toEqual(['f-2010'])
    expect(groups[0]?.entries[0]?.entries?.map((e) => e.id)).toEqual([
      'f-2010',
      'f-2012',
      'f-2015',
    ])
  })

  it('passes franchise_id null entries through unchanged (AC-1)', () => {
    const sorted = sortTimeline(
      [fe('a', utc(2001, 1, 1), null), fe('b', utc(2002, 1, 1), null)],
      'release_asc',
    )
    const collapsed = groupByFranchise(sorted)
    expect(collapsed).toEqual(sorted)
    expect(collapsed.every((e) => e.entries === undefined)).toBe(true)
  })

  it('treats a blank franchise_id as ungrouped, never collapsing it (review patch)', () => {
    // An empty-string id is "no franchise", same as null: two blank-id rows
    // must stay separate, not collapse into a label-less synthetic.
    const sorted = sortTimeline(
      [fe('a', utc(2001, 1, 1), ''), fe('b', utc(2002, 1, 1), '')],
      'release_asc',
    )
    const collapsed = groupByFranchise(sorted)
    expect(collapsed).toEqual(sorted)
    expect(collapsed.every((e) => e.entries === undefined)).toBe(true)
  })

  it('passes a single-member franchise through as a normal row (D7)', () => {
    const collapsed = groupByFranchise(
      sortTimeline(
        [fe('solo', utc(2005, 1, 1), 'lonely'), fe('x', utc(2006, 1, 1), null)],
        'release_asc',
      ),
    )
    expect(collapsed.map((e) => e.id)).toEqual(['solo', 'x'])
    expect(collapsed.every((e) => e.entries === undefined)).toBe(true)
  })

  it('keeps year groups un-fragmented under release_desc, the default-sort trap (D1)', () => {
    // Franchise 'f' spans 2010 + 2015; standalones sit at 2012 and a later 2010.
    const mix = [
      fe('f-2010', utc(2010, 3, 1), 'f'),
      fe('f-2015', utc(2015, 3, 1), 'f'),
      fe('s-2012', utc(2012, 3, 1), null),
      fe('s-2010', utc(2010, 9, 1), null),
    ]
    const mode: SortMode = 'release_desc'
    const groups = groupByYear(groupByFranchise(sortTimeline(mix, mode)), mode)
    // The anchor-slot rule keeps the synthetic at the 2010 slot, so 2010 stays
    // a single group. The naive first-seen-slot strands it at 2015 and claims
    // 2010, splitting the year in two.
    expect(groups.map((g) => g.year)).toEqual([2012, 2010])
    const y2010 = groups.find((g) => g.year === 2010)
    const synthetic = y2010?.entries.find((e) => e.entries !== undefined)
    expect(synthetic?.id).toBe('f-2010')
    expect(synthetic?.entries?.map((e) => e.id)).toEqual(['f-2010', 'f-2015'])
  })

  it('does not mutate the input array or its rows (purity)', () => {
    const sorted = sortTimeline(
      [fe('f-2015', utc(2015, 6, 1), 'saga'), fe('f-2010', utc(2010, 6, 1), 'saga')],
      'release_asc',
    )
    const snapshot = sorted.map((e) => ({ ...e }))
    groupByFranchise(sorted)
    groupByFranchise(sorted)
    expect(sorted).toEqual(snapshot)
    expect(sorted.every((e) => e.entries === undefined)).toBe(true)
  })
})

describe('purity', () => {
  it('returns identical output across calls and never mutates the input', () => {
    const before = fixture.map((e) => ({ ...e }))
    const beforeIds = ids(fixture)
    const modes: SortMode[] = [
      'release_asc',
      'release_desc',
      'consumed_asc',
      'consumed_desc',
      'added_asc',
    ]
    for (const mode of modes) {
      expect(sortTimeline(fixture, mode)).toEqual(sortTimeline(fixture, mode))
      const sorted = sortTimeline(fixture, mode)
      expect(groupByYear(sorted, mode)).toEqual(groupByYear(sorted, mode))
    }
    expect(ids(fixture)).toEqual(beforeIds)
    expect(fixture).toEqual(before)
  })
})

describe('eraTokenForYear', () => {
  it('maps each decade boundary to the adjacent era token', () => {
    expect(eraTokenForYear(1979)).toBe('--ground-pre-1980')
    expect(eraTokenForYear(1980)).toBe('--ground-1980s')
    expect(eraTokenForYear(1989)).toBe('--ground-1980s')
    expect(eraTokenForYear(1990)).toBe('--ground-1990s')
    expect(eraTokenForYear(1999)).toBe('--ground-1990s')
    expect(eraTokenForYear(2000)).toBe('--ground-2000s')
    expect(eraTokenForYear(2009)).toBe('--ground-2000s')
    expect(eraTokenForYear(2010)).toBe('--ground-2010s')
    expect(eraTokenForYear(2019)).toBe('--ground-2010s')
    expect(eraTokenForYear(2020)).toBe('--ground-2020s')
  })

  it('floors every pre-1980 year into the open-ended pre-1980 era', () => {
    expect(eraTokenForYear(1900)).toBe('--ground-pre-1980')
    expect(eraTokenForYear(1965)).toBe('--ground-pre-1980')
    expect(eraTokenForYear(1970)).toBe('--ground-pre-1980')
  })

  it('maps 2020 and later to --ground-2020s (the base ground)', () => {
    expect(eraTokenForYear(2020)).toBe('--ground-2020s')
    expect(eraTokenForYear(2023)).toBe('--ground-2020s')
    expect(eraTokenForYear(2099)).toBe('--ground-2020s')
  })
})
