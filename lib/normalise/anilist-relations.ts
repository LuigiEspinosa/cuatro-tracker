import type {
  AnilistRelationBuckets,
  AnilistRelationNode,
  AnilistRelationType,
} from '@/lib/api/anilist'

// Story 8.5's RelationsList organism consumes this shape. Kept distinct from
// AnilistRelationNode so the UI layer never sees raw AniList camelCase fields
// (consistency with the rest of the unified MediaItem surface).
export interface NormalisedRelation {
  id: number
  title: string
  format: string | null
  cover_path: string | null
  relationType: AnilistRelationType
}

export interface NormalisedRelationBuckets {
  sequel: NormalisedRelation[]
  prequel: NormalisedRelation[]
  sideStory: NormalisedRelation[]
  parent: NormalisedRelation[]
  adaptation: NormalisedRelation[]
}

function preferredTitle(title: {
  userPreferred?: string | null
  romaji: string | null
  english: string | null
  native: string | null
}): string {
  // Story 8.2 AC: title fallback chain is romaji -> english -> native.
  // userPreferred is AniList's pre-computed convenience field that already
  // honours the viewer's locale; we use it when present so a future "Display
  // titles as: English" setting (Phase 11+) does not require a normaliser
  // change. Falls back to the spec'd chain otherwise.
  return (
    title.userPreferred ?? title.romaji ?? title.english ?? title.native ?? ''
  )
}

function pickCover(coverImage?: {
  extraLarge?: string | null
  large?: string | null
  medium?: string | null
}): string | null {
  // AniList cover paths are full URLs (e.g. https://s4.anilist.co/...) so the
  // unified poster_path / cover_path field stores them verbatim. Render-time
  // code distinguishes URL vs TMDB-style path via startsWith('http'). Prefer
  // extraLarge when present for the relations panel hero treatment; downstream
  // can render a smaller variant via the AniList CDN's query-param resize.
  return coverImage?.extraLarge ?? coverImage?.large ?? coverImage?.medium ?? null
}

function toRelation(
  node: AnilistRelationNode,
  relationType: AnilistRelationType,
): NormalisedRelation {
  return {
    id: node.id,
    title: preferredTitle(node.title),
    format: node.format ?? null,
    cover_path: pickCover(node.coverImage),
    relationType,
  }
}

// Project AniList relation buckets (from getMediaRelations or from the
// .relations field on a getMedia payload) into the unified shape Story 8.5's
// RelationsList consumes. Empty input -> all-empty arrays (never null), so
// callers can map / iterate without optional-chain noise.
export function normaliseRelations(
  buckets: AnilistRelationBuckets,
): NormalisedRelationBuckets {
  return {
    sequel: buckets.sequel.map((n) => toRelation(n, 'SEQUEL')),
    prequel: buckets.prequel.map((n) => toRelation(n, 'PREQUEL')),
    sideStory: buckets.sideStory.map((n) => toRelation(n, 'SIDE_STORY')),
    parent: buckets.parent.map((n) => toRelation(n, 'PARENT')),
    adaptation: buckets.adaptation.map((n) => toRelation(n, 'ADAPTATION')),
  }
}
