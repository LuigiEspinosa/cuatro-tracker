import { describe, expect, it } from 'vitest'
import {
  MEDIA,
  MEDIUMS,
  SIZES,
  coverAspectHeightMultiplier,
  tvInnerRadius,
} from '@/components/molecules/FramedCover/media-registry'
import type { Medium, Size } from '@/components/molecules/FramedCover/media-registry'

describe('media-registry shape', () => {
  it('enumerates all 5 mediums', () => {
    expect(MEDIUMS).toEqual(['movies', 'tv', 'anime', 'manga', 'games'])
    expect(Object.keys(MEDIA).sort()).toEqual([...MEDIUMS].sort())
  })

  it('enumerates 5 sizes (Story 5.3 added hero-cover + scroller for the dashboard rotator and horizontal scrollers)', () => {
    expect(SIZES).toEqual(['thumb', 'card', 'hero-cover', 'scroller', 'hero'])
  })

  it('every medium carries name, chrome, aspect, sizes, and stroke metadata', () => {
    for (const medium of MEDIUMS) {
      const cfg = MEDIA[medium]
      expect(typeof cfg.name).toBe('string')
      expect(typeof cfg.chrome).toBe('string')
      expect(typeof cfg.aspect).toBe('string')
      expect(typeof cfg.strokeHex).toBe('string')
      expect(cfg.strokeHex.startsWith('#')).toBe(true)
      expect(typeof cfg.strokeVar).toBe('string')
      expect(typeof cfg.glowVar).toBe('string')
    }
  })

  it('every medium has all 3 size variants with the bundle dimensions', () => {
    for (const medium of MEDIUMS) {
      for (const size of SIZES) {
        const dims = MEDIA[medium].sizes[size]
        expect(dims.outerW, `${medium}/${size} outerW`).toBeGreaterThan(0)
        expect(dims.outerH, `${medium}/${size} outerH`).toBeGreaterThan(0)
        expect(dims.innerW, `${medium}/${size} innerW`).toBeGreaterThan(0)
        expect(dims.innerH, `${medium}/${size} innerH`).toBeGreaterThan(0)
        expect(dims.strokeW, `${medium}/${size} strokeW`).toBeGreaterThan(0)
        // Inner cutout always fits within outer dimensions
        expect(dims.innerW + dims.padL + dims.padR).toBe(dims.outerW)
        expect(dims.innerH + dims.padT + dims.padB).toBe(dims.outerH)
      }
    }
  })

  it('stroke widths follow the per-size ramp (thumb 1px / card 2-3px / hero 4-5px)', () => {
    for (const medium of MEDIUMS) {
      const sizes = MEDIA[medium].sizes
      expect(sizes.thumb.strokeW, `${medium} thumb stroke`).toBe(1)
      expect(sizes.card.strokeW, `${medium} card stroke`).toBeGreaterThanOrEqual(2)
      expect(sizes.card.strokeW, `${medium} card stroke`).toBeLessThanOrEqual(3)
      expect(sizes.hero.strokeW, `${medium} hero stroke`).toBeGreaterThanOrEqual(4)
      expect(sizes.hero.strokeW, `${medium} hero stroke`).toBeLessThanOrEqual(5)
    }
  })

  it('bundle-locked dimensions match the prompt + bundle source', () => {
    // Movies: 12px left spine padding at card / 24px at hero
    expect(MEDIA.movies.sizes.card.padL).toBe(12)
    expect(MEDIA.movies.sizes.hero.padL).toBe(24)
    expect(MEDIA.movies.sizes.card.outerW).toBe(212)
    expect(MEDIA.movies.sizes.hero.outerW).toBe(520)
    // TV: uniform 6px / 12px padding
    expect(MEDIA.tv.sizes.card.padL).toBe(6)
    expect(MEDIA.tv.sizes.hero.padL).toBe(12)
    // Anime: uniform 12px / 24px padding
    expect(MEDIA.anime.sizes.card.padL).toBe(12)
    expect(MEDIA.anime.sizes.hero.padL).toBe(24)
    // Games: 24px / 56px top banner padding
    expect(MEDIA.games.sizes.card.padT).toBe(24)
    expect(MEDIA.games.sizes.hero.padT).toBe(56)
    // Games is 3:4 aspect (innerW=480, innerH=640 at hero)
    expect(MEDIA.games.sizes.hero.innerH).toBe(640)
  })

  it('typed `as const` so consumers see literal types (compile-time readonly check)', () => {
    type MoviesCfg = (typeof MEDIA)['movies']
    type ReadonlyName = MoviesCfg['name']
    const _check: ReadonlyName extends string ? true : false = true
    expect(_check).toBe(true)
  })
})

describe('tvInnerRadius', () => {
  it.each<[Size, number]>([
    ['thumb', 0],
    ['card', 4],
    ['hero', 10],
  ])('returns %s = %i', (size, expected) => {
    expect(tvInnerRadius(size)).toBe(expected)
  })
})

describe('coverAspectHeightMultiplier', () => {
  it.each<[Medium, number]>([
    ['movies', 3 / 2],
    ['tv', 3 / 2],
    ['anime', 3 / 2],
    ['manga', 3 / 2],
    ['games', 4 / 3],
  ])('returns %s = %f', (medium, expected) => {
    expect(coverAspectHeightMultiplier(medium)).toBeCloseTo(expected, 5)
  })
})
