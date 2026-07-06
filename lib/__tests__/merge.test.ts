import { describe, it, expect } from 'vitest'
import { MediaType } from '@prisma/client'
import {
  computeSimilarity,
  MERGE_SIMILARITY_THRESHOLD,
  type MergeCandidate,
} from '@/lib/merge'

// 1-based month so fixtures read like calendar dates (mirror timeline.test.ts:13).
// The day/month are irrelevant to scoring (yearProximity reads only the UTC year),
// so fixtures vary just the title, year, and type.
const utc = (year: number, month: number, day: number) =>
  new Date(Date.UTC(year, month - 1, day))

const candidate = (
  title: string,
  year: number,
  type: MediaType = MediaType.MOVIE,
): MergeCandidate => ({ title, release_date: utc(year, 1, 1), type })

describe('computeSimilarity', () => {
  it('scores identical inputs exactly 1 (rounding erases the IEEE-754 0.999...)', () => {
    const score = computeSimilarity(
      candidate('Blade Runner', 1982),
      candidate('Blade Runner', 1982),
    )
    expect(score).toBe(1)
  })

  it('scores an article-only title difference 1 (both reduce to "lord of rings")', () => {
    const score = computeSimilarity(
      candidate('The Lord of the Rings', 2001),
      candidate('Lord of the Rings', 2001),
    )
    expect(score).toBe(1)
  })

  it('does not score two content-free titles (both normalise to empty) as a match', () => {
    // "The" and "A" both reduce to '' after the whole-word article strip. Without
    // the pair-level guard, jaro('', '') returns 1 and this scores a false 1.0.
    // Same year and type, so the guarded title axis (0) leaves 0.3 * 1 + 0.1 = 0.4.
    const score = computeSimilarity(candidate('The', 2020), candidate('A', 2020))
    expect(score).toBe(0.4)
    expect(score).toBeLessThan(MERGE_SIMILARITY_THRESHOLD)
  })

  it('gates a same-title same-year cross-type pair to 0', () => {
    const score = computeSimilarity(
      candidate('Fargo', 1996, MediaType.MOVIE),
      candidate('Fargo', 1996, MediaType.TV_SHOW),
    )
    expect(score).toBe(0)
    expect(score).toBeLessThan(MERGE_SIMILARITY_THRESHOLD)
  })

  it('scores a same-title one-year-drift same-type pair above the threshold', () => {
    const score = computeSimilarity(
      candidate('Dune', 2020),
      candidate('Dune', 2021),
    )
    // 0.6 * 1 + 0.3 * 0.7 + 0.1 = 0.91
    expect(score).toBe(0.91)
    expect(score).toBeGreaterThan(MERGE_SIMILARITY_THRESHOLD)
  })

  it('pins a fractional Jaro-Winkler score for a partial title match (guards the Jaro core)', () => {
    // "celeste" vs "ceelste" is a single adjacent-letter transposition: the Jaro
    // core sees 7 matches and 1 transposition, so the base is below 1 and the final
    // score (same year, same type: 0.6 * jaroWinkler + 0.3 + 0.1) rounds to 0.9771.
    // An implementation that dropped transposition counting would treat these as
    // identical (jaroWinkler 1) and score 1.0, so this is the only fixture whose
    // value proves the transposition and match-window logic actually runs.
    const score = computeSimilarity(
      candidate('Celeste', 2018),
      candidate('Ceelste', 2018),
    )
    expect(score).toBe(0.9771)
    expect(score).toBeGreaterThan(MERGE_SIMILARITY_THRESHOLD)
  })

  it('scores unrelated titles below 0.5 with same type and a distant year (title axis drives it)', () => {
    // Same type contributes a flat 0.1 and a year gap over 5 zeroes the year
    // axis, so only the low title similarity remains: the case AC-6 warns must
    // NOT be built with same-year same-type fixtures.
    const score = computeSimilarity(
      candidate('Amelie', 2001),
      candidate('Gladiator', 2018),
    )
    expect(score).toBeLessThan(0.5)
  })

  it('pins the threshold constant and documents its inclusive >= contract', () => {
    expect(MERGE_SIMILARITY_THRESHOLD).toBe(0.85)
    // A candidate qualifies at score >= MERGE_SIMILARITY_THRESHOLD (both = and >
    // count). Callers use >=; we do not fabricate an exactly-0.85 Jaro-Winkler
    // pair (those values are not round). The 0.91 pair proves the > side.
    const qualifying = computeSimilarity(
      candidate('Dune', 2020),
      candidate('Dune', 2021),
    )
    expect(qualifying >= MERGE_SIMILARITY_THRESHOLD).toBe(true)
  })

  it('is commutative with strict equality across match, partial, and cross-type pairs', () => {
    const pairs: [MergeCandidate, MergeCandidate][] = [
      [candidate('Akira', 1988), candidate('Akira', 1988)],
      [candidate('Celeste', 2018), candidate('Ceelste', 2019)],
      [
        candidate('Fargo', 1996, MediaType.MOVIE),
        candidate('Fargo', 1996, MediaType.TV_SHOW),
      ],
    ]
    for (const [a, b] of pairs) {
      expect(computeSimilarity(a, b)).toBe(computeSimilarity(b, a))
    }
  })

  it('always returns a score within [0, 1]', () => {
    const samples: [MergeCandidate, MergeCandidate][] = [
      [candidate('Blade Runner', 1982), candidate('Blade Runner', 1982)],
      [candidate('Dune', 2020), candidate('Dune', 2021)],
      [candidate('Amelie', 2001), candidate('Gladiator', 2018)],
      [
        candidate('Fargo', 1996, MediaType.MOVIE),
        candidate('Fargo', 1996, MediaType.TV_SHOW),
      ],
      [candidate('Solaris', 1972), candidate('Solaris', 2002)],
    ]
    for (const [a, b] of samples) {
      const score = computeSimilarity(a, b)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }
  })
})
