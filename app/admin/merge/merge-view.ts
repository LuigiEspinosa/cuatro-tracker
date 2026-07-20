import { MediaType, type MediaItem, type MergeSuggestion } from '@prisma/client'
import { getImageUrl } from '@/lib/api/tmdb-images'
import { getGameImageUrl } from '@/lib/api/igdb-images'
import { MERGE_SIMILARITY_THRESHOLD } from '@/lib/merge'
import { TYPE_TO_MEDIUM, TYPE_LABEL, type Medium } from '@/lib/ui/media-display'

/* Server-side view builders for /admin/merge (Story 11.4 Task 4).
 *
 * The RSC page serialises each pending suggestion into a client-safe,
 * display-ready shape here so the client review component holds no Prisma
 * types and constructs no image URLs. The field diff is pure and static, so it
 * is computed here too (not in the browser) and shipped with the payload.
 *
 * These are plain data-shaping functions with no I/O; buildMergeDiff is
 * unit-tested directly.
 */

export type MergeRecordView = {
  // MediaItem id, used verbatim as the accept POST's sourceId / targetId.
  id: string
  type: MediaType
  medium: Medium
  typeLabel: string
  title: string
  originalTitle: string | null
  sourceLabel: string | null
  externalId: string | null
  overview: string | null
  posterUrl: string | null
  releaseYear: string
  genres: string
}

export type MergeDiffRow = {
  field: string
  label: string
  source: string
  target: string
  match: boolean
}

export type MergeSuggestionView = {
  id: string
  confidence: number
  nearThreshold: boolean
  source: MergeRecordView
  target: MergeRecordView
  diff: MergeDiffRow[]
}

type SuggestionWithPair = MergeSuggestion & {
  source: MediaItem
  target: MediaItem
}

// A suggestion is "near threshold" once its confidence sits within one rung
// (0.05) of the cutoff, mirroring the bundle's 0.86 NEAR THRESHOLD vs 0.94 HIGH
// MATCH frames. Purely a label; it changes no behaviour.
const NEAR_THRESHOLD_BAND = 0.05

function releaseYear(mediaItem: MediaItem): string {
  // getUTCFullYear, never getFullYear: release_date is UTC-anchored, so a local
  // read would shift a boundary year by the machine timezone (repo convention).
  return String(mediaItem.release_date.getUTCFullYear())
}

function genresLabel(mediaItem: MediaItem): string {
  return mediaItem.genres.join(' · ')
}

function externalId(mediaItem: MediaItem): string | null {
  if (mediaItem.tmdb_id !== null) return `TMDB #${mediaItem.tmdb_id}`
  if (mediaItem.anilist_id !== null) return `AniList #${mediaItem.anilist_id}`
  if (mediaItem.igdb_id !== null) return `IGDB #${mediaItem.igdb_id}`
  if (mediaItem.steam_app_id !== null) return `Steam #${mediaItem.steam_app_id}`
  return null
}

function sourceLabel(mediaItem: MediaItem): string | null {
  if (mediaItem.tmdb_id !== null) return 'From TMDB'
  if (mediaItem.anilist_id !== null) return 'From AniList'
  if (mediaItem.igdb_id !== null) return 'From IGDB'
  if (mediaItem.steam_app_id !== null) return 'From Steam'
  return null
}

function resolvePosterUrl(mediaItem: MediaItem): string | null {
  if (!mediaItem.poster_path) return null
  // Games store a bare IGDB image_id; every other source stores either a TMDB
  // path (prefixed by getImageUrl) or a full AniList URL (passed through).
  if (mediaItem.type === MediaType.GAME) {
    return getGameImageUrl(mediaItem.poster_path, 't_cover_big')
  }
  return getImageUrl(mediaItem.poster_path, 'w342')
}

export function serializeRecord(mediaItem: MediaItem): MergeRecordView {
  return {
    id: mediaItem.id,
    type: mediaItem.type,
    medium: TYPE_TO_MEDIUM[mediaItem.type],
    typeLabel: TYPE_LABEL[mediaItem.type],
    title: mediaItem.title,
    originalTitle: mediaItem.original_title,
    sourceLabel: sourceLabel(mediaItem),
    externalId: externalId(mediaItem),
    overview: mediaItem.overview,
    posterUrl: resolvePosterUrl(mediaItem),
    releaseYear: releaseYear(mediaItem),
    genres: genresLabel(mediaItem),
  }
}

type FieldSpec = {
  field: string
  label: string
  get: (mediaItem: MediaItem) => string
  // Core fields always render even when both sides are empty (they never are in
  // practice: title / type / release_date are non-null). Non-core rows are
  // dropped when neither side carries a value, so the diff stays scannable.
  core?: boolean
}

const numberOrEmpty = (value: number | null): string =>
  value === null ? '' : String(value)

// Per-medium extra rows keyed off the source type. Merge candidates are always
// the same type (computeSimilarity gates on it), so keying off source is safe.
const PER_MEDIUM_FIELDS: Partial<Record<MediaType, FieldSpec[]>> = {
  [MediaType.ANIME]: [
    { field: 'episodes', label: 'Episodes', get: (m) => numberOrEmpty(m.episode_count) },
    { field: 'studio', label: 'Studio', get: (m) => m.studio_name ?? '' },
  ],
  [MediaType.MANGA]: [
    { field: 'chapters', label: 'Chapters', get: (m) => numberOrEmpty(m.chapter_count) },
    { field: 'volumes', label: 'Volumes', get: (m) => numberOrEmpty(m.volume_count) },
    { field: 'author', label: 'Author', get: (m) => m.author_name ?? '' },
  ],
  [MediaType.GAME]: [
    { field: 'developer', label: 'Developer', get: (m) => m.developer_name ?? '' },
    { field: 'publisher', label: 'Publisher', get: (m) => m.publisher_name ?? '' },
    { field: 'platforms', label: 'Platforms', get: (m) => m.platforms.join(' · ') },
  ],
}

export function buildMergeDiff(
  source: MediaItem,
  target: MediaItem,
): MergeDiffRow[] {
  const specs: FieldSpec[] = [
    { field: 'title', label: 'Title', get: (m) => m.title, core: true },
    { field: 'original_title', label: 'Original Title', get: (m) => m.original_title ?? '' },
    { field: 'type', label: 'Type', get: (m) => TYPE_LABEL[m.type], core: true },
    { field: 'release_year', label: 'Release Year', get: releaseYear, core: true },
    { field: 'genres', label: 'Genres', get: genresLabel },
    ...(PER_MEDIUM_FIELDS[source.type] ?? []),
    { field: 'source_id', label: 'Source ID', get: (m) => externalId(m) ?? '' },
  ]

  const rows: MergeDiffRow[] = []
  for (const spec of specs) {
    const sourceValue = spec.get(source)
    const targetValue = spec.get(target)
    // Drop a non-core row when neither side has anything to show.
    if (!spec.core && sourceValue === '' && targetValue === '') continue
    rows.push({
      field: spec.field,
      label: spec.label,
      source: sourceValue,
      target: targetValue,
      match: sourceValue === targetValue,
    })
  }
  return rows
}

export function serializeSuggestion(
  suggestion: SuggestionWithPair,
): MergeSuggestionView {
  return {
    id: suggestion.id,
    confidence: suggestion.confidence,
    nearThreshold:
      suggestion.confidence < MERGE_SIMILARITY_THRESHOLD + NEAR_THRESHOLD_BAND,
    source: serializeRecord(suggestion.source),
    target: serializeRecord(suggestion.target),
    diff: buildMergeDiff(suggestion.source, suggestion.target),
  }
}
