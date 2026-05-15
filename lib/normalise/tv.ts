import { Prisma, MediaType } from '@prisma/client'
import { TmdbTvSchema, TmdbSeasonSchema } from '@/lib/api/tmdb'
import { parseReleaseDate } from '@/lib/normalise/release-date'

// Raw TMDB `status` strings map to the small fixed enum that drives the TV
// grid's `Continuing` filter chip (Story 7.4). Unknown values default to
// `'continuing'` because the filter chip is permissive — better to over-show
// than under-show when TMDB introduces a new status string.
const LIFECYCLE_STATUS_MAP: Record<
  string,
  'ended' | 'continuing' | 'in_production'
> = {
  Ended: 'ended',
  Canceled: 'ended',
  'Returning Series': 'continuing',
  'In Production': 'in_production',
  Planned: 'in_production',
  Pilot: 'in_production',
}

function mapLifecycleStatus(
  tmdbStatus: string,
): 'ended' | 'continuing' | 'in_production' {
  return LIFECYCLE_STATUS_MAP[tmdbStatus] ?? 'continuing'
}

export function normaliseTmdbTv(
  raw: unknown,
  seasons: unknown[],
): {
  show: Prisma.MediaItemCreateInput
  episodes: Prisma.MediaItemCreateInput[]
} {
  // Mirror `normaliseTmdbMovie`'s null-coercion for non-nullable date fields:
  // TMDB occasionally emits `first_air_date: null` for unannounced shows, and
  // `TmdbTvSchema` asserts string. Coerce null → '' so the empty-string branch
  // of `parseReleaseDate` resolves to the 1970 sentinel without relaxing the
  // upstream schema contract.
  const prepared =
    raw &&
    typeof raw === 'object' &&
    'first_air_date' in raw &&
    (raw as { first_air_date: unknown }).first_air_date === null
      ? { ...(raw as object), first_air_date: '' }
      : raw

  const source = TmdbTvSchema.parse(prepared)
  const parsedSeasons = seasons.map((s) => TmdbSeasonSchema.parse(s))

  const show: Prisma.MediaItemCreateInput = {
    type: MediaType.TV_SHOW,
    title: source.name,
    original_title: source.original_name ?? null,
    release_date: parseReleaseDate(source.first_air_date),
    end_date: source.last_air_date
      ? parseReleaseDate(source.last_air_date)
      : null,
    overview: source.overview ?? null,
    poster_path: source.poster_path,
    backdrop_path: source.backdrop_path,
    rating: source.vote_average,
    popularity: source.popularity,
    genres: source.genres.map((g) => g.name),
    status: source.status,
    lifecycle_status: mapLifecycleStatus(source.status),
    tmdb_id: source.id,
  }

  const episodes: Prisma.MediaItemCreateInput[] = parsedSeasons.flatMap(
    (season) =>
      season.episodes.map((episode) => ({
        type: MediaType.TV_EPISODE,
        title: episode.name,
        original_title: null,
        release_date: parseReleaseDate(episode.air_date ?? ''),
        overview: episode.overview ?? null,
        poster_path: null,
        backdrop_path: null,
        still_path: episode.still_path ?? null,
        rating: episode.vote_average,
        popularity: null,
        genres: [],
        season_number: episode.season_number,
        episode_number: episode.episode_number,
        runtime: episode.runtime ?? null,
        unaired: !episode.air_date,
        tmdb_id: episode.id,
      })),
  )

  return { show, episodes }
}
