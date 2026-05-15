import { z } from 'zod'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import {
  TmdbImageSizeSchema,
  getImageUrl,
  type TmdbImageSize,
} from '@/lib/api/tmdb-images'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_TIMEOUT_MS = 8000

// Re-export the image-URL helper so server-side callers can keep importing
// `getImageUrl` / `TmdbImageSize` from `@/lib/api/tmdb`. Client components
// should import from `@/lib/api/tmdb-images` directly to avoid pulling in
// logger / env / pino into the browser bundle.
export { TmdbImageSizeSchema, getImageUrl }
export type { TmdbImageSize }

export class TmdbApiError extends Error {
  readonly endpoint: string
  readonly httpStatus?: number
  readonly fieldPath?: string

  constructor(
    message: string,
    opts: {
      endpoint: string
      httpStatus?: number
      fieldPath?: string
      cause?: unknown
    },
  ) {
    super(message, opts.cause ? { cause: opts.cause } : undefined)
    this.name = 'TmdbApiError'
    this.endpoint = opts.endpoint
    this.httpStatus = opts.httpStatus
    this.fieldPath = opts.fieldPath
  }
}

const TmdbGenreSchema = z.object({
  id: z.number(),
  name: z.string(),
})

export const TmdbMovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  original_title: z.string().optional(),
  overview: z.string().nullable().optional(),
  release_date: z.string(),
  poster_path: z.string().nullable(),
  backdrop_path: z.string().nullable(),
  vote_average: z.number(),
  popularity: z.number(),
  genres: z.array(TmdbGenreSchema),
  status: z.string(),
  runtime: z.number().nullable().optional(),
})
export type TmdbMovie = z.infer<typeof TmdbMovieSchema>

export const TmdbTvSchema = z.object({
  id: z.number(),
  name: z.string(),
  original_name: z.string().optional(),
  overview: z.string().nullable().optional(),
  first_air_date: z.string(),
  poster_path: z.string().nullable(),
  backdrop_path: z.string().nullable(),
  vote_average: z.number(),
  popularity: z.number(),
  genres: z.array(TmdbGenreSchema),
  status: z.string(),
})
export type TmdbTv = z.infer<typeof TmdbTvSchema>

export const TmdbEpisodeSchema = z.object({
  id: z.number(),
  name: z.string(),
  overview: z.string().nullable().optional(),
  air_date: z.string().nullable().optional(),
  episode_number: z.number(),
  season_number: z.number(),
  still_path: z.string().nullable().optional(),
  vote_average: z.number(),
  runtime: z.number().nullable().optional(),
})
export type TmdbEpisode = z.infer<typeof TmdbEpisodeSchema>

export const TmdbCastMemberSchema = z.object({
  id: z.number(),
  name: z.string(),
  character: z.string().nullable().optional(),
  order: z.number(),
  profile_path: z.string().nullable(),
})
export type TmdbCastMember = z.infer<typeof TmdbCastMemberSchema>

export const TmdbCrewMemberSchema = z.object({
  id: z.number(),
  name: z.string(),
  job: z.string(),
  department: z.string(),
  profile_path: z.string().nullable(),
})
export type TmdbCrewMember = z.infer<typeof TmdbCrewMemberSchema>

export const TmdbCreditsSchema = z.object({
  id: z.number().optional(),
  cast: z.array(TmdbCastMemberSchema),
  crew: z.array(TmdbCrewMemberSchema),
})
export type TmdbCredits = z.infer<typeof TmdbCreditsSchema>

export const TmdbExternalIdsSchema = z.object({
  imdb_id: z.string().nullable().optional(),
  facebook_id: z.string().nullable().optional(),
  instagram_id: z.string().nullable().optional(),
  twitter_id: z.string().nullable().optional(),
})
export type TmdbExternalIds = z.infer<typeof TmdbExternalIdsSchema>

const TmdbSearchMovieResultSchema = z.object({
  media_type: z.literal('movie'),
  id: z.number(),
  title: z.string(),
  original_title: z.string().optional(),
  overview: z.string().nullable().optional(),
  release_date: z.string().optional(),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  vote_average: z.number().optional(),
  popularity: z.number().optional(),
  genre_ids: z.array(z.number()).optional(),
})

const TmdbSearchTvResultSchema = z.object({
  media_type: z.literal('tv'),
  id: z.number(),
  name: z.string(),
  original_name: z.string().optional(),
  overview: z.string().nullable().optional(),
  first_air_date: z.string().optional(),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  vote_average: z.number().optional(),
  popularity: z.number().optional(),
  genre_ids: z.array(z.number()).optional(),
})

const TmdbSearchPersonResultSchema = z.object({
  media_type: z.literal('person'),
  id: z.number(),
  name: z.string(),
  known_for_department: z.string().optional(),
  profile_path: z.string().nullable().optional(),
  popularity: z.number().optional(),
})

export const TmdbSearchMultiResultSchema = z.discriminatedUnion('media_type', [
  TmdbSearchMovieResultSchema,
  TmdbSearchTvResultSchema,
  TmdbSearchPersonResultSchema,
])
export type TmdbSearchMultiResult = z.infer<typeof TmdbSearchMultiResultSchema>

export const TmdbSearchMultiResponseSchema = z.object({
  page: z.number(),
  results: z.array(TmdbSearchMultiResultSchema),
  total_pages: z.number(),
  total_results: z.number(),
})
export type TmdbSearchMultiResponse = z.infer<
  typeof TmdbSearchMultiResponseSchema
>

const TmdbProviderSchema = z.object({
  provider_id: z.number(),
  provider_name: z.string(),
  logo_path: z.string().nullable().optional(),
  display_priority: z.number().optional(),
})

// Wire shape — what TMDB's /watch/providers endpoint actually sends per
// country: link is a TMDB-hosted URL, each provider category is omitted when
// empty. Used by `tmdbFetch` at the network boundary.
const TmdbCountryProvidersWireSchema = z.object({
  link: z.url(),
  flatrate: z.array(TmdbProviderSchema).optional(),
  buy: z.array(TmdbProviderSchema).optional(),
  rent: z.array(TmdbProviderSchema).optional(),
})

// Consumer shape — what `getWatchProviders` returns. Arrays guaranteed
// non-undefined; link is an empty string when the country has no providers
// (allows the detail page to render without null-guards).
export const TmdbCountryProvidersSchema = z.object({
  link: z.string(),
  flatrate: z.array(TmdbProviderSchema),
  rent: z.array(TmdbProviderSchema),
  buy: z.array(TmdbProviderSchema),
})
export type TmdbCountryProviders = z.infer<typeof TmdbCountryProvidersSchema>

export const TmdbWatchProvidersResponseSchema = z.object({
  id: z.number(),
  results: z.record(z.string(), TmdbCountryProvidersWireSchema),
})
export type TmdbWatchProvidersResponse = z.infer<
  typeof TmdbWatchProvidersResponseSchema
>

async function tmdbFetch<T extends z.ZodType>(
  endpoint: string,
  params: Record<string, string | number>,
  schema: T,
): Promise<z.infer<T>> {
  const url = new URL(`${TMDB_BASE}${endpoint}`)
  url.searchParams.set('api_key', env.TMDB_API_KEY)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }

  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(TMDB_TIMEOUT_MS),
    })
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const isTimeout =
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')
    logger.error(
      { endpoint, durationMs, err },
      isTimeout ? 'tmdb_fetch_timeout' : 'tmdb_fetch_network_error',
    )
    throw new TmdbApiError(
      isTimeout
        ? `TMDB request timed out after ${TMDB_TIMEOUT_MS}ms: ${endpoint}`
        : `TMDB fetch failed: ${endpoint}`,
      { endpoint, cause: err },
    )
  }

  const durationMs = Date.now() - startedAt

  if (!response.ok) {
    logger.error(
      { endpoint, status: response.status, durationMs },
      'tmdb_fetch_http_error',
    )
    throw new TmdbApiError(
      `TMDB HTTP ${response.status}: ${endpoint}`,
      { endpoint, httpStatus: response.status },
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (err) {
    logger.error(
      { endpoint, durationMs, err },
      'tmdb_fetch_invalid_json',
    )
    throw new TmdbApiError(`TMDB returned invalid JSON: ${endpoint}`, {
      endpoint,
      httpStatus: response.status,
      cause: err,
    })
  }

  const parsed = schema.safeParse(payload)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const fieldPath = issue?.path.join('.') ?? '(root)'
    logger.error(
      {
        endpoint,
        status: response.status,
        durationMs,
        fieldPath,
        err: parsed.error,
      },
      'tmdb_fetch_parse_error',
    )
    throw new TmdbApiError(
      `TMDB response parse failed at "${fieldPath}": ${endpoint}`,
      {
        endpoint,
        httpStatus: response.status,
        fieldPath,
        cause: parsed.error,
      },
    )
  }

  return parsed.data
}

export function searchMulti(query: string): Promise<TmdbSearchMultiResponse> {
  return tmdbFetch('/search/multi', { query }, TmdbSearchMultiResponseSchema)
}

export function getMovie(id: number): Promise<TmdbMovie>
export function getMovie(
  id: number,
  options: { withCredits: true },
): Promise<
  TmdbMovie & { credits: TmdbCredits; external_ids?: TmdbExternalIds }
>
export function getMovie(
  id: number,
  options?: { withCredits?: boolean },
): Promise<
  | TmdbMovie
  | (TmdbMovie & { credits: TmdbCredits; external_ids?: TmdbExternalIds })
> {
  if (options?.withCredits) {
    // external_ids is `.optional()` so a TMDB response missing the field
    // degrades gracefully (no WATCH button) instead of failing the detail page.
    const schema = TmdbMovieSchema.extend({
      credits: TmdbCreditsSchema,
      external_ids: TmdbExternalIdsSchema.optional(),
    })
    return tmdbFetch(
      `/movie/${id}`,
      { append_to_response: 'credits,external_ids' },
      schema,
    )
  }
  return tmdbFetch(`/movie/${id}`, {}, TmdbMovieSchema)
}

export function getMovieCredits(id: number): Promise<TmdbCredits> {
  return tmdbFetch(`/movie/${id}/credits`, {}, TmdbCreditsSchema)
}

export function getTv(id: number): Promise<TmdbTv> {
  return tmdbFetch(`/tv/${id}`, {}, TmdbTvSchema)
}

export function getEpisode(
  showId: number,
  season: number,
  episode: number,
): Promise<TmdbEpisode> {
  return tmdbFetch(
    `/tv/${showId}/season/${season}/episode/${episode}`,
    {},
    TmdbEpisodeSchema,
  )
}

export async function getWatchProviders(
  type: 'movie' | 'tv',
  id: number,
  country: string,
): Promise<TmdbCountryProviders> {
  const response = await tmdbFetch(
    `/${type}/${id}/watch/providers`,
    {},
    TmdbWatchProvidersResponseSchema,
  )
  const slice = response.results[country]
  return {
    link: slice?.link ?? '',
    flatrate: slice?.flatrate ?? [],
    rent: slice?.rent ?? [],
    buy: slice?.buy ?? [],
  }
}
