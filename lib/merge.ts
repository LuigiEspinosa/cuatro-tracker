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

// Optional marker words peeled with the ordinal they introduce, so "Kill Bill
// Vol. 1" and "Back to the Future Part II" both reduce to a stem plus a number.
// A marker also licenses an otherwise ambiguous numeral: "Part I" is the first
// instalment, where a bare trailing "I" is usually the pronoun.
const ORDINAL_MARKERS = new Set([
  'part',
  'vol',
  'volume',
  'season',
  'episode',
  'chapter',
  'book',
  'act',
])

// Canonical roman numeral, anchored, over already-lowercased input. The
// lookahead is load-bearing: every group is nullable, so without it the pattern
// matches the empty string.
const ROMAN_NUMERAL =
  /^(?=[ivxlcdm])m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/
const ROMAN_VALUES = new Map([
  ['i', 1],
  ['v', 5],
  ['x', 10],
  ['l', 50],
  ['c', 100],
  ['d', 500],
  ['m', 1000],
])

// * Failure mode: ROMAN_NUMERAL is a shape test, not a vocabulary test, and
// * plenty of ordinary words have the shape. "mix" parses to 1009, "cd" to 400,
// * "civ" to 104, and the bare letters i, v and x are a pronoun, an abbreviation
// * and a name as often as they are numbers. Reading one of those as an
// * instalment number silently zeroes a real duplicate ("Sonic CD" against
// * "Sonic"), so an UNMARKED roman numeral is only honoured when it is one of
// * the canonical forms below. A marker word removes the ambiguity, so a marked
// * numeral goes through ROMAN_NUMERAL unrestricted.
// * Roads not taken: a general English word list. The instalment numbers that
// * actually ship stop well before XX, so enumerating them is smaller, faster
// * and has no false-negative tail.
const UNMARKED_ROMAN = new Set([
  'ii',
  'iii',
  'iv',
  'v',
  'vi',
  'vii',
  'viii',
  'ix',
  'xi',
  'xii',
  'xiii',
  'xiv',
  'xv',
  'xvi',
  'xvii',
  'xviii',
  'xix',
  'xx',
])

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

function parseRoman(token: string): number {
  let total = 0
  for (let i = 0; i < token.length; i++) {
    const value = ROMAN_VALUES.get(token[i]) ?? 0
    const next = ROMAN_VALUES.get(token[i + 1] ?? '') ?? 0
    total += value < next ? -value : value
  }
  return total
}

// Reads one token as an instalment number. `marked` says a marker word sits
// immediately before it, which is what licenses the ambiguous roman forms.
function parseOrdinal(token: string, marked: boolean): number | null {
  if (/^\d+$/.test(token)) return Number.parseInt(token, 10)
  if (marked) return ROMAN_NUMERAL.test(token) ? parseRoman(token) : null
  return UNMARKED_ROMAN.has(token) ? parseRoman(token) : null
}

// Splits a normalised title into the stem and the instalment number it carries.
// Operates on normaliseTitle output only, so there is no second normaliser to
// keep in step.
//
// * Failure mode: the scan runs right to left rather than reading only the last
// * token, because an edition suffix hides the number behind it. "FIFA 22
// * Ultimate Edition" and "FIFA 23 Ultimate Edition" are the naming form Steam
// * actually ships, and a trailing-only split leaves both numbers inside the
// * stem, so the stems differ, the guard never fires, and the pair scores 0.9.
//
// A null ordinal means the title carries no instalment number at all, which is
// deliberately not the same as carrying 1.
function splitOrdinal(normalisedTitle: string): {
  stem: string
  ordinal: number | null
} {
  if (normalisedTitle === '') return { stem: '', ordinal: null }

  const tokens = normalisedTitle.split(' ')
  for (let i = tokens.length - 1; i >= 0; i--) {
    const marked = i > 0 && ORDINAL_MARKERS.has(tokens[i - 1])
    const ordinal = parseOrdinal(tokens[i], marked)
    if (ordinal === null) continue
    const stem = tokens.slice(0, marked ? i - 1 : i).concat(tokens.slice(i + 1))
    return { stem: stem.join(' '), ordinal }
  }
  return { stem: normalisedTitle, ordinal: null }
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

  // * Failure mode: a metric that scores "FIFA 22" against "FIFA 23" at 0.88
  // * feeds a review queue whose accept permanently deletes a MediaItem, so this
  // * is a data-safety guard rather than a precision tweak. Two works that share
  // * a stem and disagree on their instalment number are different works, which
  // * is an identity question the metric owns; it gates like the type mismatch
  // * above instead of applying a penalty, and it runs before the Jaro-Winkler
  // * work so a gated pair costs nothing.
  // * Failure mode: BOTH sides have to carry a real number. Reading a missing
  // * numeral as an implicit 1 also reads "DOOM (1993)" against "DOOM" as 1993
  // * against 1, which gates the exact cross-source pair the Steam date
  // * enrichment exists to make reachable, silently and with nothing left in the
  // * review queue to notice. A disambiguating year suffix is common on Steam
  // * (app 2280 is named "DOOM (1993)") and on AniList ("Fruits Basket (2019)"),
  // * so the implicit form costs more real duplicates than the sequels it wins.
  // * Roads not taken: comparing the numeral as a string, which would destroy
  // * "Portal 2" against "Portal II"; treating an absent numeral as 1, which is
  // * the trade above and which gives up "Stranger Things" against "Stranger
  // * Things 2"; and spelled-out numerals ("Part One"), which normalise to
  // * different stems and are already scored on that.
  const ordinalA = splitOrdinal(titleA)
  const ordinalB = splitOrdinal(titleB)
  if (
    ordinalA.ordinal !== null &&
    ordinalB.ordinal !== null &&
    ordinalA.ordinal !== ordinalB.ordinal &&
    ordinalA.stem !== '' &&
    ordinalA.stem === ordinalB.stem
  )
    return 0

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
