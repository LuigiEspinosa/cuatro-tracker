import { describe, it, expect } from 'vitest'
import { getImageUrl, TMDB_IMAGE_BASE } from '@/lib/api/tmdb-images'

describe('lib/api/tmdb-images: getImageUrl', () => {
  it('returns null when path is null', () => {
    expect(getImageUrl(null, 'w185')).toBeNull()
  })

  it('returns null when path is the empty string (treat like null)', () => {
    expect(getImageUrl('', 'w185')).toBeNull()
  })

  it('prefixes the TMDB CDN base + size for a path-only value', () => {
    expect(getImageUrl('/abc.jpg', 'w185')).toBe(`${TMDB_IMAGE_BASE}/w185/abc.jpg`)
  })

  it('passes a full https URL through unchanged (Story 8.4 OI #2, AniList CDN URLs)', () => {
    const url =
      'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx170942-x.jpg'
    expect(getImageUrl(url, 'w185')).toBe(url)
  })

  it('passes a full http URL through unchanged', () => {
    const url = 'http://example.com/cover.jpg'
    expect(getImageUrl(url, 'w185')).toBe(url)
  })

  it('handles mixed-case schemes (HTTPS://, HTTP://) per RFC 3986 §3.1', () => {
    expect(getImageUrl('HTTPS://s4.anilist.co/x.jpg', 'w185')).toBe(
      'HTTPS://s4.anilist.co/x.jpg',
    )
    expect(getImageUrl('Http://example.com/y.jpg', 'w185')).toBe(
      'Http://example.com/y.jpg',
    )
  })

  it('does NOT mistake a path that merely contains "http" for an absolute URL', () => {
    // /http_thing.jpg is a TMDB-style path that happens to contain 'http' but
    // is anchored at index 1; the regex requires anchor-at-start.
    expect(getImageUrl('/http_thing.jpg', 'w185')).toBe(
      `${TMDB_IMAGE_BASE}/w185/http_thing.jpg`,
    )
  })

  it('still prefixes when the path is a relative path-only TMDB string with no protocol', () => {
    expect(getImageUrl('/poster.png', 'w342')).toBe(
      `${TMDB_IMAGE_BASE}/w342/poster.png`,
    )
  })
})
