import { Prisma, MediaType } from '@prisma/client'
import { TmdbMovieSchema, TmdbCreditsSchema } from '@/lib/api/tmdb'
import { parseReleaseDate } from '@/lib/normalise/release-date'

export type NormalisedCastMember = {
  id: number
  name: string
  role: string
  order: number
  profile_path: string | null
}

export type NormalisedCrewMember = {
  id: number
  name: string
  role: string
  order: number
  profile_path: string | null
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

export function normaliseTmdbCredits(raw: unknown): {
  cast: NormalisedCastMember[]
  crew: NormalisedCrewMember[]
} {
  const source = TmdbCreditsSchema.parse(raw)
  return {
    cast: source.cast.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.character ?? '',
      order: c.order,
      profile_path: c.profile_path,
    })),
    crew: source.crew.map((c, idx) => ({
      id: c.id,
      name: c.name,
      role: c.job,
      order: idx,
      profile_path: c.profile_path,
    })),
  }
}
