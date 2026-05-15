export const RELEASE_DATE_SENTINEL = new Date('1970-01-01T00:00:00Z')

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
