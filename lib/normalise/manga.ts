import { Prisma, MediaType } from '@prisma/client'
import {
  AnilistMediaSchema,
  partialDateToDate,
  type AnilistMedia,
  type AnilistStaffEdge,
} from '@/lib/api/anilist'
import { RELEASE_DATE_SENTINEL } from '@/lib/normalise/release-date'

// Story 8.2 AC: title fallback chain is romaji -> english -> native.
// Same shape as the anime normaliser; kept inline (rather than shared) so each
// medium's normaliser remains a self-contained read.
function preferredTitle(title: AnilistMedia['title']): string {
  return (
    title.userPreferred ?? title.romaji ?? title.english ?? title.native ?? ''
  )
}

function pickCover(coverImage?: AnilistMedia['coverImage']): string | null {
  return (
    coverImage?.extraLarge ??
    coverImage?.large ??
    coverImage?.medium ??
    null
  )
}

// Story 8.2 AC: author_name = first staff with role 'Story'.
// AniList tags single-author manga as 'Story & Art' (e.g. Berserk -> Miura);
// split-creator manga gets separate 'Story' and 'Art' edges (e.g. Death Note ->
// Ohba / Obata). Try 'Story & Art' first because that's a stronger signal of
// the canonical author. Fall back to plain 'Story'. We do NOT fall back to
// the first staff edge of any role - if neither matches, return null instead
// of mis-attributing a Translator or Letterer.
function pickAuthor(staff?: { edges: AnilistStaffEdge[] }): string | null {
  if (!staff || staff.edges.length === 0) return null
  const storyAndArt = staff.edges.find((e) =>
    /^\s*Story\s*&\s*Art\s*$/i.test(e.role),
  )
  if (storyAndArt) return storyAndArt.node.name.full
  const story = staff.edges.find((e) => /^\s*Story\s*$/i.test(e.role))
  return story?.node.name.full ?? null
}

export function normaliseAnilistManga(
  raw: unknown,
): Prisma.MediaItemCreateInput {
  const source = AnilistMediaSchema.parse(raw)

  // NFR13 invariant: release_date is never null / NaN. AniList's startDate may
  // be `{ year: null, month: null, day: null }` for unannounced manga; the
  // partial-date helper returns null in that case, and we fall through to the
  // project-wide 1970 sentinel.
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
    type: MediaType.MANGA,
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
    chapter_count: source.chapters ?? null,
    volume_count: source.volumes ?? null,
    format: source.format ?? null,
    author_name: pickAuthor(source.staff),
    anilist_id: source.id,
  }
}
