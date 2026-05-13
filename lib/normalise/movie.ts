import { Prisma, MediaType } from '@prisma/client'
import { TmdbMovieSchema } from '@/lib/api/tmdb'

const RELEASE_DATE_SENTINEL = new Date('1970-01-01T00:00:00Z')

function parseReleaseDate(raw: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  if (/^\d{4}$/.test(raw)) {
    const year = Number.parseInt(raw, 10)
    return new Date(Date.UTC(year, 0, 1))
  }
  return new Date(RELEASE_DATE_SENTINEL)
}

export function normaliseTmdbMovie(raw: unknown): Prisma.MediaItemCreateInput {
  // AC-2 mandates accepting `release_date: null` as a valid fallback-chain input.
  // The adapter schema asserts string; coerce null → '' here so the empty-string
  // branch of parseReleaseDate handles it without relaxing the upstream contract.
  const prepared =
    raw &&
    typeof raw === 'object' &&
    'release_date' in raw &&
    (raw as { release_date: unknown }).release_date === null
      ? { ...(raw as object), release_date: '' }
      : raw

  const source = TmdbMovieSchema.parse(prepared)

  return {
    type: MediaType.MOVIE,
    title: source.title,
    original_title: source.original_title ?? null,
    release_date: parseReleaseDate(source.release_date),
    overview: source.overview ?? null,
    poster_path: source.poster_path,
    backdrop_path: source.backdrop_path,
    rating: source.vote_average,
    popularity: source.popularity,
    genres: source.genres.map((g) => g.name),
    tmdb_id: source.id,
  }
}
