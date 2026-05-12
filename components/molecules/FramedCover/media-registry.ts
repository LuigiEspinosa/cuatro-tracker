/* Source: _bmad-output/design-bundles/cuatro-tracker-2026-04-26/09-frames/
 *         cuatro-tracker/project/framed-cover.jsx (MEDIA constant, lines 7-78).
 * Story 2.6 ports the bundle's MEDIA shape into a typed `as const` registry.
 * Per-size dimensions are LOCKED here; consumers read them via the typed
 * accessors below. Any change to a dimension must also update
 * `docs/design-prompts/09-frames.md` §3 (the design-prompt source-of-truth).
 *
 * Field divergence vs the bundle: the bundle's MEDIA carries `glow`
 * (e.g. `var(--frame-glow-movies)`) and `glowStr` (the human-readable spec
 * string) per medium. The actual token in `cuatro-tracker/app/tokens.css`
 * lines 99-103 is named `--frame-stroke-<medium>-glow` (with the `-glow`
 * suffix, matching the LED token convention). This registry uses `glowVar`
 * pointing at the canonical token; the bundle's `glow` and `glowStr` fields
 * are dropped to avoid having two ways to spell the same thing.
 */

export const MEDIA = {
  movies: {
    name: 'Movies',
    chrome: 'VHS clamshell',
    aspect: '2:3 TMDB poster',
    sizes: {
      thumb: { outerW: 72, outerH: 104, padL: 4, padR: 4, padT: 4, padB: 4, innerW: 64, innerH: 96, strokeW: 1 },
      card: { outerW: 212, outerH: 304, padL: 12, padR: 8, padT: 8, padB: 8, innerW: 192, innerH: 288, strokeW: 2 },
      hero: { outerW: 520, outerH: 752, padL: 24, padR: 16, padT: 16, padB: 16, innerW: 480, innerH: 720, strokeW: 4 },
    },
    strokeHex: '#B5AC9D',
    strokeVar: 'var(--frame-stroke-movies)',
    glowVar: 'var(--frame-stroke-movies-glow)',
  },
  tv: {
    name: 'TV',
    chrome: 'CRT bezel',
    aspect: '2:3 TMDB poster',
    sizes: {
      thumb: { outerW: 72, outerH: 104, padL: 4, padR: 4, padT: 4, padB: 4, innerW: 64, innerH: 96, strokeW: 1 },
      card: { outerW: 204, outerH: 300, padL: 6, padR: 6, padT: 6, padB: 6, innerW: 192, innerH: 288, strokeW: 3 },
      hero: { outerW: 504, outerH: 744, padL: 12, padR: 12, padT: 12, padB: 12, innerW: 480, innerH: 720, strokeW: 5 },
    },
    strokeHex: '#7A7468',
    strokeVar: 'var(--frame-stroke-tv)',
    glowVar: 'var(--frame-stroke-tv-glow)',
  },
  anime: {
    name: 'Anime',
    chrome: '35mm slide mount',
    aspect: '2:3 AniList cover',
    sizes: {
      thumb: { outerW: 76, outerH: 108, padL: 6, padR: 6, padT: 6, padB: 6, innerW: 64, innerH: 96, strokeW: 1 },
      card: { outerW: 216, outerH: 312, padL: 12, padR: 12, padT: 12, padB: 12, innerW: 192, innerH: 288, strokeW: 2 },
      hero: { outerW: 528, outerH: 768, padL: 24, padR: 24, padT: 24, padB: 24, innerW: 480, innerH: 720, strokeW: 4 },
    },
    strokeHex: '#9D8C66',
    strokeVar: 'var(--frame-stroke-anime)',
    glowVar: 'var(--frame-stroke-anime-glow)',
  },
  manga: {
    name: 'Manga',
    chrome: 'Magazine plate',
    aspect: '2:3 AniList cover',
    sizes: {
      thumb: { outerW: 72, outerH: 104, padL: 4, padR: 4, padT: 4, padB: 4, innerW: 64, innerH: 96, strokeW: 1 },
      card: { outerW: 208, outerH: 304, padL: 8, padR: 8, padT: 8, padB: 8, innerW: 192, innerH: 288, strokeW: 2 },
      hero: { outerW: 512, outerH: 752, padL: 16, padR: 16, padT: 16, padB: 16, innerW: 480, innerH: 720, strokeW: 4 },
    },
    strokeHex: '#B5AC9D',
    strokeVar: 'var(--frame-stroke-manga)',
    glowVar: 'var(--frame-stroke-manga-glow)',
  },
  games: {
    name: 'Games',
    chrome: 'Arcade marquee',
    aspect: '3:4 IGDB box art',
    sizes: {
      thumb: { outerW: 72, outerH: 97, padL: 4, padR: 4, padT: 8, padB: 4, innerW: 64, innerH: 85, strokeW: 1 },
      card: { outerW: 208, outerH: 288, padL: 8, padR: 8, padT: 24, padB: 8, innerW: 192, innerH: 256, strokeW: 2 },
      hero: { outerW: 512, outerH: 712, padL: 16, padR: 16, padT: 56, padB: 16, innerW: 480, innerH: 640, strokeW: 4 },
    },
    strokeHex: '#5C4677',
    strokeVar: 'var(--frame-stroke-games)',
    glowVar: 'var(--frame-stroke-games-glow)',
  },
} as const

export type Medium = keyof typeof MEDIA
export type Size = 'thumb' | 'card' | 'hero'
export type MediaDims = (typeof MEDIA)[Medium]['sizes'][Size]
export type MediaConfig = (typeof MEDIA)[Medium]

export const MEDIUMS: readonly Medium[] = ['movies', 'tv', 'anime', 'manga', 'games'] as const
export const SIZES: readonly Size[] = ['thumb', 'card', 'hero'] as const

/* TV is the only medium whose inner cutout receives rounded corners
 * (per design-system §0.4, the inner CRT screen area is the lone
 * exception to the 0-radius rule). Returns the radius in px.
 */
export function tvInnerRadius(size: Size): number {
  if (size === 'hero') return 10
  if (size === 'card') return 4
  return 0
}

/* Aspect ratio for the placeholder cover image per medium.
 * Movies/TV/Anime/Manga at 2:3 (height = 1.5×width).
 * Games at 3:4 (height ≈ 1.333×width per IGDB box art convention).
 */
export function coverAspectHeightMultiplier(medium: Medium): number {
  if (medium === 'games') return 4 / 3
  return 3 / 2
}
