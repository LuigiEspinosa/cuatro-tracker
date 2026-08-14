import { describe, it, expect } from 'vitest'
import {
  RELEASE_DATE_SENTINEL,
  isReleaseDateUnknown,
  deriveDisplayYear,
  deriveDisplayYearFromSource,
  deriveDisplayDate,
  parseReleaseDate,
} from '@/lib/normalise/release-date'

describe('isReleaseDateUnknown', () => {
  it('treats null and undefined as unknown', () => {
    expect(isReleaseDateUnknown(null)).toBe(true)
    expect(isReleaseDateUnknown(undefined)).toBe(true)
  })

  it('treats an Invalid Date as unknown', () => {
    expect(isReleaseDateUnknown(new Date('not a date'))).toBe(true)
  })

  it('treats the exact RELEASE_DATE_SENTINEL as unknown', () => {
    expect(isReleaseDateUnknown(new Date(RELEASE_DATE_SENTINEL))).toBe(true)
    expect(isReleaseDateUnknown(new Date('1970-01-01T00:00:00Z'))).toBe(true)
  })

  it('treats a genuine 1970 release as known (not the sentinel)', () => {
    // The sentinel is 1970-01-01T00:00:00Z exactly; any other 1970 instant is a
    // real release and must NOT be swallowed by a year === 1970 check.
    expect(isReleaseDateUnknown(new Date('1970-06-15T00:00:00Z'))).toBe(false)
    expect(isReleaseDateUnknown(new Date('1970-01-01T00:00:01Z'))).toBe(false)
  })

  it('treats an ordinary release date as known', () => {
    expect(isReleaseDateUnknown(new Date('2020-09-17T00:00:00Z'))).toBe(false)
  })
})

describe('deriveDisplayYear', () => {
  it('returns null for the sentinel and nullish input', () => {
    expect(deriveDisplayYear(new Date(RELEASE_DATE_SENTINEL))).toBeNull()
    expect(deriveDisplayYear(null)).toBeNull()
    expect(deriveDisplayYear(undefined)).toBeNull()
  })

  it('keeps the year of a genuine 1970 release (regression: sentinel collision)', () => {
    expect(deriveDisplayYear(new Date('1970-06-15T00:00:00Z'))).toBe(1970)
  })

  it('returns the UTC year for an ordinary date', () => {
    expect(deriveDisplayYear(new Date('2020-09-17T00:00:00Z'))).toBe(2020)
  })
})

describe('deriveDisplayYearFromSource', () => {
  it('keeps the year of a genuine 1970 source date (regression: the year === 1970 heuristic)', () => {
    expect(deriveDisplayYearFromSource('1970-06-15')).toBe(1970)
  })

  it('returns null for an empty string and nullish input', () => {
    expect(deriveDisplayYearFromSource('')).toBeNull()
    expect(deriveDisplayYearFromSource(null)).toBeNull()
    expect(deriveDisplayYearFromSource(undefined)).toBeNull()
  })

  it('returns null for the exact sentinel instant', () => {
    expect(deriveDisplayYearFromSource('1970-01-01')).toBeNull()
  })

  it('returns the year for a full date and a year-only string', () => {
    expect(deriveDisplayYearFromSource('2020-09-17')).toBe(2020)
    expect(deriveDisplayYearFromSource('2020')).toBe(2020)
  })

  it('returns null for a malformed date instead of the 0 parseInt produced', () => {
    // The retired heuristic read parseInt('0000') as a finite year !== 1970 and
    // rendered `MOVIE 0`; routing through parseReleaseDate yields the sentinel.
    // Only for shapes Date() rejects, though: see the next case.
    expect(deriveDisplayYearFromSource('0000-00-00')).toBeNull()
  })

  it('still returns 0 for a calendar-valid year-zero date (documented residue)', () => {
    // '0000-01-01' parses to a valid Date, so the sentinel rule never fires and
    // the year 0 survives to the call sites, whose guard is `year !== null`.
    // Unreachable from TMDB, which emits a real date or an empty string.
    // Closing it means a `year > 0` clamp, a behaviour change beyond the story
    // that introduced this helper. Pinned so the residue stays visible.
    expect(deriveDisplayYearFromSource('0000-01-01')).toBe(0)
  })

  it('returns null for shapes the retired heuristic still read a year out of', () => {
    // Undeclared delta: parseInt('2020-13-45'.slice(0, 4)) was 2020. Both of
    // these now fall through to the sentinel and drop the year.
    expect(deriveDisplayYearFromSource('2020-13-45')).toBeNull()
    expect(deriveDisplayYearFromSource('2020-09')).toBeNull()
  })
})

describe('deriveDisplayDate', () => {
  it('returns null for the sentinel and nullish input', () => {
    expect(deriveDisplayDate(new Date(RELEASE_DATE_SENTINEL))).toBeNull()
    expect(deriveDisplayDate(null)).toBeNull()
  })

  it('returns the ISO string for a genuine 1970 release', () => {
    expect(deriveDisplayDate(new Date('1970-06-15T00:00:00Z'))).toBe(
      '1970-06-15T00:00:00.000Z',
    )
  })

  it('returns the ISO string for an ordinary date', () => {
    expect(deriveDisplayDate(new Date('2020-09-17T00:00:00Z'))).toBe(
      '2020-09-17T00:00:00.000Z',
    )
  })
})

describe('parseReleaseDate', () => {
  it('parses a full YYYY-MM-DD date', () => {
    expect(parseReleaseDate('2020-09-17').toISOString()).toBe(
      '2020-09-17T00:00:00.000Z',
    )
  })

  it('parses a year-only string to Jan 1 UTC', () => {
    expect(parseReleaseDate('2020').toISOString()).toBe(
      '2020-01-01T00:00:00.000Z',
    )
  })

  it('falls back to the sentinel for an unparseable string', () => {
    expect(parseReleaseDate('').getTime()).toBe(RELEASE_DATE_SENTINEL.getTime())
    expect(parseReleaseDate('unknown').getTime()).toBe(
      RELEASE_DATE_SENTINEL.getTime(),
    )
  })

  it('falls back to the sentinel for a regex-valid but calendar-invalid date', () => {
    // '2020-13-45' clears the shape gate but Date() yields Invalid Date; the
    // NaN guard inside the branch must fall through to the sentinel.
    expect(parseReleaseDate('2020-13-45').getTime()).toBe(
      RELEASE_DATE_SENTINEL.getTime(),
    )
  })
})
