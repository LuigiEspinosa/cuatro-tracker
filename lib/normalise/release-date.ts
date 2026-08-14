export const RELEASE_DATE_SENTINEL = new Date('1970-01-01T00:00:00Z')

// * Treat a stored release_date equal to RELEASE_DATE_SENTINEL as "release date
// * unknown" (the normalisers fall back to the sentinel when a source API has no
// * usable date). Detect it by exact epoch-ms equality, NOT by
// * `getUTCFullYear() === 1970`: the year check also strips genuine 1970 releases
// * (early arcade / mainframe titles exist in source catalogues) and it is
// * timezone-fragile. This matches the chronological timeline's Story 10.2 D4
// * sentinel rule, so a grid card, a detail page, and the timeline all agree on
// * whether an item is dated.
export function isReleaseDateUnknown(date: Date | null | undefined): boolean {
  if (!date) return true
  const ms = date.getTime()
  return Number.isNaN(ms) || ms === RELEASE_DATE_SENTINEL.getTime()
}

// Display year for a stored release_date; null when the date is unknown.
export function deriveDisplayYear(date: Date | null | undefined): number | null {
  if (!date || isReleaseDateUnknown(date)) return null
  return date.getUTCFullYear()
}

// ISO-8601 string for a stored release_date; null when the date is unknown.
export function deriveDisplayDate(date: Date | null | undefined): string | null {
  if (!date || isReleaseDateUnknown(date)) return null
  return date.toISOString()
}

// Display year for a raw source date string (a live TMDB `release_date` /
// `first_air_date`, which may be empty); null when the date is unknown.
// * Failure mode: the retired heuristic (parseInt over the leading four
// * characters, compared against the year 1970) dropped the year of every
// * genuine 1970 release and read a malformed '0000-00-00' as the finite year
// * 0. Routing the string through parseReleaseDate first puts source strings
// * under the same exact epoch-ms rule the module header states.
// * Long-term cost: the sentinel rule only fires on strings Date() rejects, so
// * a calendar-valid '0000-01-01' still yields the year 0, and conversely
// * '2020-13-45' or a partial '2020-09' now yield null where the old heuristic
// * read 2020. Both are unreachable from TMDB detail endpoints, which emit a
// * real date or an empty string; both are pinned in the test suite.
export function deriveDisplayYearFromSource(
  raw: string | null | undefined,
): number | null {
  if (!raw) return null
  return deriveDisplayYear(parseReleaseDate(raw))
}

export function parseReleaseDate(raw: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  if (/^\d{4}$/.test(raw)) {
    const year = Number.parseInt(raw, 10)
    return new Date(Date.UTC(year, 0, 1))
  }
  return new Date(RELEASE_DATE_SENTINEL)
}
