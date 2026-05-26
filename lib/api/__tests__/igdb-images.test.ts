import { describe, it, expect } from 'vitest'
import {
  IGDB_IMAGE_BASE,
  getGameImageUrl,
  type IgdbImageSize,
} from '@/lib/api/igdb-images'

describe('lib/api/igdb-images: getGameImageUrl', () => {
  const SIZES: IgdbImageSize[] = [
    't_thumb',
    't_cover_small',
    't_cover_big',
    't_screenshot_med',
    't_1080p',
  ]

  it.each(SIZES)('builds the documented URL for size %s', (size) => {
    expect(getGameImageUrl('co1uii', size)).toBe(
      `${IGDB_IMAGE_BASE}/${size}/co1uii.jpg`,
    )
  })

  it('round-trips a representative cover image_id at the t_cover_big size', () => {
    expect(getGameImageUrl('co1uii', 't_cover_big')).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co1uii.jpg',
    )
  })

  // Empty imageId is treated as a programmer error: the constructed URL still
  // carries the trailing `.jpg` (yielding a 404 from IGDB). Story 9.4 will
  // guard at the call site.
  it('returns the (technically broken) URL when imageId is empty (documented behaviour)', () => {
    expect(getGameImageUrl('', 't_cover_big')).toBe(
      `${IGDB_IMAGE_BASE}/t_cover_big/.jpg`,
    )
  })
})
