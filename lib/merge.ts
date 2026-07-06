import type { MediaItem } from '@prisma/client'

// * The inclusive similarity cutoff (a pair qualifies when score >= this value)
// * at or above which two MediaItem rows are surfaced for merge review. Exported
// * so Story 11.6's scan job and Story 11.4's UI share one definition instead of
// * each inlining 0.85.
export const MERGE_SIMILARITY_THRESHOLD = 0.85

// * The three scoring axes sum to exactly 1.0, which keeps the weighted sum in
// * [0, 1] and lets a type mismatch gate to 0 (see computeSimilarity) rather than
// * leaking a 0.9 cross-type score past the threshold.
const TITLE_WEIGHT = 0.6
const YEAR_WEIGHT = 0.3
const TYPE_WEIGHT = 0.1

// Rounding precision for the final score. 0.6 + 0.3 + 0.1 is 0.9999999999999999
// in IEEE-754, so identical inputs must be rounded to return exactly 1.
const SCORE_PRECISION = 4

// Whole-word articles dropped by normaliseTitle so "The Lord of the Rings" and
// "Lord of the Rings" reduce to the same tokens.
const ARTICLES = new Set(['the', 'a', 'an'])

// Winkler common-prefix bonus: each of up to JARO_WINKLER_MAX_PREFIX leading
// characters that match adds JARO_WINKLER_PREFIX_SCALE * (1 - jaro) to the score.
const JARO_WINKLER_PREFIX_SCALE = 0.1
const JARO_WINKLER_MAX_PREFIX = 4

// yearProximity ladder: rung values over the absolute UTC-year difference.
const YEAR_PROXIMITY_SAME = 1.0
const YEAR_PROXIMITY_ADJACENT = 0.7
const YEAR_PROXIMITY_NEAR = 0.3
const YEAR_PROXIMITY_FAR = 0.0
const YEAR_SPAN_NEAR_MAX = 5

export type MergeCandidate = Pick<MediaItem, 'title' | 'release_date' | 'type'>

// * Deliberately distinct from the exported normaliseTitle in
// * lib/search/federation.ts, which preserves articles and deletes all
// * whitespace ("The Office" -> "theoffice") as a search dedup key. This one
// * replaces punctuation with a space, drops whole-word articles, then collapses
// * whitespace, so word boundaries survive and an article-only difference scores
// * identical. The two normalisers are separate by design (Epic 4 retro); keep
// * this one private and do not couple them.
function normaliseTitle(title: string): string {
  return title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !ARTICLES.has(token))
    .join(' ')
}

function jaro(s1: string, s2: string): number {
  // Both empty normalise to "identical"; one empty shares nothing.
  if (s1 === '' && s2 === '') return 1
  if (s1 === '' || s2 === '') return 0

  const len1 = s1.length
  const len2 = s2.length
  const matchWindow = Math.max(0, Math.floor(Math.max(len1, len2) / 2) - 1)
  const s1matched = new Array<boolean>(len1).fill(false)
  const s2matched = new Array<boolean>(len2).fill(false)

  let matches = 0
  for (let i = 0; i < len1; i++) {
    const lo = Math.max(0, i - matchWindow)
    const hi = Math.min(len2 - 1, i + matchWindow)
    for (let j = lo; j <= hi; j++) {
      if (!s2matched[j] && s1[i] === s2[j]) {
        s1matched[i] = true
        s2matched[j] = true
        matches++
        break
      }
    }
  }
  if (matches === 0) return 0

  let transpositions = 0
  let k = 0
  for (let i = 0; i < len1; i++) {
    if (!s1matched[i]) continue
    while (!s2matched[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }
  transpositions /= 2

  return (
    (matches / len1 + matches / len2 + (matches - transpositions) / matches) / 3
  )
}

function jaroWinkler(s1: string, s2: string): number {
  const base = jaro(s1, s2)
  const maxPrefix = Math.min(s1.length, s2.length, JARO_WINKLER_MAX_PREFIX)
  let prefix = 0
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] !== s2[i]) break
    prefix++
  }
  return base + prefix * JARO_WINKLER_PREFIX_SCALE * (1 - base)
}

function yearProximity(a: Date, b: Date): number {
  // * getUTCFullYear, never getFullYear: stored release dates are UTC-anchored,
  // * so a local-time read would shift a boundary year by the machine timezone
  // * and make the score machine-dependent. Ironclad repo convention
  // * (lib/timeline.ts:89 and 13 other sites).
  const span = Math.abs(a.getUTCFullYear() - b.getUTCFullYear())
  if (span === 0) return YEAR_PROXIMITY_SAME
  if (span === 1) return YEAR_PROXIMITY_ADJACENT
  if (span <= YEAR_SPAN_NEAR_MAX) return YEAR_PROXIMITY_NEAR
  return YEAR_PROXIMITY_FAR
}

export function computeSimilarity(a: MergeCandidate, b: MergeCandidate): number {
  // * A media-type mismatch is a hard disqualifier, not a 0.1 additive penalty:
  // * a MOVIE and a TV_SHOW are categorically different MediaItem rows and must
  // * never be a merge candidate. The additive form scores a same-name same-year
  // * cross-type pair at 0.9 (above threshold), so the gate is required both for
  // * the metric to be correct standalone and for Story 11.6's assumption that
  // * "typeMatch=0 already excludes cross-type pairs" to hold.
  if (a.type !== b.type) return 0

  const titleA = normaliseTitle(a.title)
  const titleB = normaliseTitle(b.title)
  // * Two titles that both normalise to empty (all-article or all-punctuation)
  // * carry no comparable title, so they must not read as a perfect match.
  // * jaro('', '') returns 1 by its own unit contract, but at the pair level "no
  // * title" is not "identical title": without this guard "The" and "A" would
  // * score a maximum-confidence 1.0 merge.
  const titleSimilarity =
    titleA === '' && titleB === '' ? 0 : jaroWinkler(titleA, titleB)
  // typeMatch is 1 here (equal types passed the gate), so its term is TYPE_WEIGHT.
  const raw =
    TITLE_WEIGHT * titleSimilarity +
    YEAR_WEIGHT * yearProximity(a.release_date, b.release_date) +
    TYPE_WEIGHT
  const factor = 10 ** SCORE_PRECISION
  return Math.round(raw * factor) / factor
}
