import { Prisma, MediaType } from '@prisma/client'
import {
  AnilistMediaSchema,
  partialDateToDate,
  type AnilistMedia,
} from '@/lib/api/anilist'
import { RELEASE_DATE_SENTINEL } from '@/lib/normalise/release-date'

// Story 8.2 AC: title fallback chain is romaji -> english -> native.
// userPreferred is AniList's pre-computed convenience field that already
// honours the viewer's locale; we honour it first so a future "Display titles
// as: English" setting (Phase 11+) does not require a normaliser change.
// Falls back to the spec'd chain otherwise. Final '' fallback covers the
// pathological case where AniList returns every title field null, which
// shouldn't happen but keeps the type non-nullable per the schema.
function preferredTitle(title: AnilistMedia['title']): string {
  return (
    title.userPreferred ?? title.romaji ?? title.english ?? title.native ?? ''
  )
}

// AniList covers are full CDN URLs (e.g. https://s4.anilist.co/...); the
// unified MediaItem.poster_path stores them verbatim. Render-time code
// distinguishes URL-vs-path via startsWith('http'). Prefer extraLarge for the
// detail-page hero treatment; the grid can resize down via the AniList CDN.
function pickCover(coverImage?: AnilistMedia['coverImage']): string | null {
  return (
    coverImage?.extraLarge ??
    coverImage?.large ??
    coverImage?.medium ??
    null
  )
}

// Story 8.2 AC: studio_name = first studio with isAnimationStudio = true.
// We do NOT fall back to a non-animation producer studio - if no animation
// studio is flagged, the field stays null. Surfacing 'Production I.G.' for a
// licensing-only producer would be worse than showing nothing.
function pickAnimationStudio(
  studios?: AnilistMedia['studios'],
): string | null {
  if (!studios) return null
  const animation = studios.nodes.find((s) => s.isAnimationStudio === true)
  return animation?.name ?? null
}

export function normaliseAnilistAnime(
  raw: unknown,
): Prisma.MediaItemCreateInput {
  const source = AnilistMediaSchema.parse(raw)

  // NFR13 invariant: release_date must be a valid Date, never null / NaN.
  // partialDateToDate returns null when AniList reports year=null (unannounced
  // titles); fall through to the project-wide 1970 sentinel that the timeline
  // sort already groups under "unknown release".
  const releaseDate =
    partialDateToDate(
      source.startDate.year,
      source.startDate.month,
      source.startDate.day,
    ) ?? new Date(RELEASE_DATE_SENTINEL)

  const endDate = source.endDate
    ? partialDateToDate(
        source.endDate.year,
        source.endDate.month,
        source.endDate.day,
      )
    : null

  return {
    type: MediaType.ANIME,
    title: preferredTitle(source.title),
    original_title: source.title.native ?? null,
    release_date: releaseDate,
    end_date: endDate,
    overview: source.description ?? null,
    poster_path: pickCover(source.coverImage),
    backdrop_path: source.bannerImage ?? null,
    rating: source.averageScore ?? null,
    popularity: source.popularity ?? null,
    genres: source.genres ?? [],
    status: source.status ?? null,
    episode_count: source.episodes ?? null,
    format: source.format ?? null,
    studio_name: pickAnimationStudio(source.studios),
    season: source.season ?? null,
    season_year: source.seasonYear ?? null,
    source_material: source.source ?? null,
    anilist_id: source.id,
  }
}
