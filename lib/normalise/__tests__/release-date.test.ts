import { describe, it, expect } from 'vitest'
import {
  RELEASE_DATE_SENTINEL,
  isReleaseDateUnknown,
  deriveDisplayYear,
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
