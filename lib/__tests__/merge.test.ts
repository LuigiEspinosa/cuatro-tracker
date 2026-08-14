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

  it('gates a numbered-sequel pair to 0 at its real release years', () => {
    // Every pair below scores ABOVE the threshold without the ordinal gate. The
    // ungated score is recorded per pair so this fixture cannot go vacuous: if
    // the gate is ever removed, these return the recorded value, not 0. The last
    // two carry an edition suffix after the instalment number, which is the
    // naming form Steam ships and which a trailing-only split cannot see.
    const gated: [string, MergeCandidate, MergeCandidate][] = [
      // 0.8757
      ['FIFA', candidate('FIFA 22', 2021), candidate('FIFA 23', 2022)],
      // 0.8940
      [
        'Kill Bill',
        candidate('Kill Bill: Vol. 1', 2003),
        candidate('Kill Bill: Vol. 2', 2004),
      ],
      // 0.9038
      [
        'Deathly Hallows',
        candidate('Harry Potter and the Deathly Hallows: Part 1', 2010),
        candidate('Harry Potter and the Deathly Hallows: Part 2', 2011),
      ],
      // 0.9048
      [
        'Back to the Future',
        candidate('Back to the Future Part II', 1989),
        candidate('Back to the Future Part III', 1990),
      ],
      // 0.8986
      [
        'Spy x Family',
        candidate('Spy x Family Season 1', 2022, MediaType.ANIME),
        candidate('Spy x Family Season 2', 2023, MediaType.ANIME),
      ],
      // 0.8940
      [
        'Just Dance',
        candidate('Just Dance 2016', 2015),
        candidate('Just Dance 2017', 2016),
      ],
      // 0.9000
      [
        'FIFA Ultimate Edition',
        candidate('FIFA 22 Ultimate Edition', 2021),
        candidate('FIFA 23 Ultimate Edition', 2022),
      ],
      // 0.8980
      [
        'Madden Deluxe',
        candidate('Madden NFL 21 Deluxe', 2020),
        candidate('Madden NFL 22 Deluxe', 2021),
      ],
    ]
    for (const [label, a, b] of gated) {
      expect(`${label}:${computeSimilarity(a, b)}`).toBe(`${label}:0`)
    }
  })

  it('does not gate a pair whose ordinals parse to the same value', () => {
    // Values, not strings: a string comparison of the numeral would zero all
    // three of these genuine duplicates.
    expect(
      computeSimilarity(candidate('Portal 2', 2011), candidate('Portal II', 2011)),
    ).toBe(0.9583)
    expect(
      computeSimilarity(
        candidate('Final Fantasy VII', 1997),
        candidate('Final Fantasy 7', 1997),
      ),
    ).toBe(0.9708)
    expect(
      computeSimilarity(candidate('Rocky II', 1979), candidate('Rocky 2', 1979)),
    ).toBe(0.9529)
  })

  it('only gates when BOTH titles carry a numeral, so a year-disambiguated duplicate survives', () => {
    // A missing numeral is not an implicit 1. Reading it as one gates every
    // title whose sibling carries a disambiguating year, which is exactly the
    // cross-source pair the Steam date enrichment exists to make reachable:
    // Steam app 2280 is named "DOOM (1993)" and AniList ships "Fruits Basket
    // (2019)". Those must stay mergeable against their unsuffixed twin.
    const survivors: [string, MergeCandidate, MergeCandidate][] = [
      ['DOOM', candidate('DOOM (1993)', 1993), candidate('DOOM', 1993)],
      [
        'Fruits Basket',
        candidate('Fruits Basket (2019)', 2019, MediaType.ANIME),
        candidate('Fruits Basket', 2019, MediaType.ANIME),
      ],
      [
        'Spy x Family',
        candidate('Spy x Family', 2022, MediaType.ANIME),
        candidate('Spy x Family Season 1', 2022, MediaType.ANIME),
      ],
    ]
    for (const [label, a, b] of survivors) {
      const score = computeSimilarity(a, b)
      expect(`${label}:${score > MERGE_SIMILARITY_THRESHOLD}`).toBe(
        `${label}:true`,
      )
    }

    // The accepted cost of the rule above, pinned so it cannot regress silently:
    // this pair scored 0.8959 and was gated while an absent numeral read as 1.
    const conceded = computeSimilarity(
      candidate('Stranger Things', 2016, MediaType.TV_SHOW),
      candidate('Stranger Things 2', 2017, MediaType.TV_SHOW),
    )
    expect(conceded).toBe(0.8959)
  })

  it('reads an unmarked roman numeral only in its canonical instalment forms', () => {
    // ROMAN_NUMERAL is a shape test, so "mix" (1009), "cd" (400) and "civ" (104)
    // all parse as numbers. Honouring them would hard-gate a real duplicate on a
    // word, which is the opposite of what the guard is for.
    const notNumerals: [string, MergeCandidate, MergeCandidate][] = [
      [
        'Final Mix',
        candidate('Kingdom Hearts Final Mix', 2002, MediaType.GAME),
        candidate('Kingdom Hearts Final', 2002, MediaType.GAME),
      ],
      [
        'CD',
        candidate('Sonic CD', 1993, MediaType.GAME),
        candidate('Sonic', 1993, MediaType.GAME),
      ],
      [
        'Civ',
        candidate('Sid Meiers Civ', 1991, MediaType.GAME),
        candidate('Sid Meiers', 1991, MediaType.GAME),
      ],
    ]
    for (const [label, a, b] of notNumerals) {
      const score = computeSimilarity(a, b)
      expect(`${label}:${score > MERGE_SIMILARITY_THRESHOLD}`).toBe(
        `${label}:true`,
      )
    }

    // A marker word removes the ambiguity, so a marked numeral is read in full.
    expect(
      computeSimilarity(
        candidate('Twin Peaks Season I', 1990, MediaType.TV_SHOW),
        candidate('Twin Peaks Season II', 1991, MediaType.TV_SHOW),
      ),
    ).toBe(0)
  })

  it('does not gate a same-stem pair that shares an ordinal or has no comparable stem', () => {
    // Case-only and article-only differences resolve to one stem and one ordinal.
    expect(
      computeSimilarity(candidate('Hitman 3', 2021), candidate('HITMAN 3', 2021)),
    ).toBe(1)
    expect(
      computeSimilarity(
        candidate('The Witcher 3', 2015),
        candidate('Witcher 3', 2015),
      ),
    ).toBe(1)
    // A bare numeral leaves an empty stem, so two unrelated number-titled works
    // are scored on their titles instead of being gated by their difference.
    expect(
      computeSimilarity(candidate('1917', 2019), candidate('300', 2006)),
    ).toBeGreaterThan(0)
  })

  it('is commutative with strict equality across match, partial, cross-type, and gated pairs', () => {
    const pairs: [MergeCandidate, MergeCandidate][] = [
      [candidate('Akira', 1988), candidate('Akira', 1988)],
      [candidate('Celeste', 2018), candidate('Ceelste', 2019)],
      [
        candidate('Fargo', 1996, MediaType.MOVIE),
        candidate('Fargo', 1996, MediaType.TV_SHOW),
      ],
      [candidate('FIFA 22', 2021), candidate('FIFA 23', 2022)],
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
      [candidate('FIFA 22', 2021), candidate('FIFA 23', 2022)],
    ]
    for (const [a, b] of samples) {
      const score = computeSimilarity(a, b)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
    }
  })
})
