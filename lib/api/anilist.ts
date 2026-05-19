import { z } from 'zod'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'

const ANILIST_ENDPOINT = 'https://graphql.anilist.co'
const ANILIST_TIMEOUT_MS = 8000

// AniList caps the public API at 90 req/min (NFR21). Holding two concurrent
// in-flight requests keeps a comfortable safety margin even on the burstiest
// detail-page fetch (Story 8.2 normaliser pulls media + relations in parallel).
// Bulk imports (Epic 11) layer a per-job 700ms delay via BullMQ on top of this.
const ANILIST_CONCURRENCY = 2

export class AnilistApiError extends Error {
  readonly endpoint: string
  readonly httpStatus?: number
  readonly fieldPath?: string
  readonly retryAfterMs?: number

  constructor(
    message: string,
    opts: {
      endpoint: string
      httpStatus?: number
      fieldPath?: string
      retryAfterMs?: number
      cause?: unknown
    },
  ) {
    super(message, opts.cause ? { cause: opts.cause } : undefined)
    this.name = 'AnilistApiError'
    this.endpoint = opts.endpoint
    this.httpStatus = opts.httpStatus
    this.fieldPath = opts.fieldPath
    this.retryAfterMs = opts.retryAfterMs
  }
}

export const AnilistMediaTypeSchema = z.enum(['ANIME', 'MANGA'])
export type AnilistMediaType = z.infer<typeof AnilistMediaTypeSchema>

export const AnilistMediaFormatSchema = z.enum([
  'TV',
  'TV_SHORT',
  'MOVIE',
  'SPECIAL',
  'OVA',
  'ONA',
  'MUSIC',
  'MANGA',
  'NOVEL',
  'ONE_SHOT',
])
export type AnilistMediaFormat = z.infer<typeof AnilistMediaFormatSchema>

export const AnilistFuzzyDateSchema = z.object({
  year: z.number().int().nullable(),
  month: z.number().int().min(1).max(12).nullable(),
  day: z.number().int().min(1).max(31).nullable(),
})
export type AnilistFuzzyDate = z.infer<typeof AnilistFuzzyDateSchema>

export const AnilistTitleSchema = z.object({
  romaji: z.string().nullable(),
  english: z.string().nullable(),
  native: z.string().nullable(),
  userPreferred: z.string().nullable().optional(),
})
export type AnilistTitle = z.infer<typeof AnilistTitleSchema>

export const AnilistCoverImageSchema = z.object({
  extraLarge: z.string().nullable().optional(),
  large: z.string().nullable().optional(),
  medium: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
})
export type AnilistCoverImage = z.infer<typeof AnilistCoverImageSchema>

export const AnilistStudioSchema = z.object({
  id: z.number(),
  name: z.string(),
  isAnimationStudio: z.boolean().optional(),
})

export const AnilistStudiosSchema = z.object({
  nodes: z.array(AnilistStudioSchema),
})

export const AnilistRelationTypeSchema = z.enum([
  'ADAPTATION',
  'PREQUEL',
  'SEQUEL',
  'PARENT',
  'SIDE_STORY',
  'CHARACTER',
  'SUMMARY',
  'ALTERNATIVE',
  'SPIN_OFF',
  'OTHER',
  'SOURCE',
  'COMPILATION',
  'CONTAINS',
])
export type AnilistRelationType = z.infer<typeof AnilistRelationTypeSchema>

export const AnilistRelationNodeSchema = z.object({
  id: z.number(),
  type: AnilistMediaTypeSchema,
  format: AnilistMediaFormatSchema.nullable().optional(),
  title: AnilistTitleSchema,
  coverImage: AnilistCoverImageSchema.optional(),
})
export type AnilistRelationNode = z.infer<typeof AnilistRelationNodeSchema>

export const AnilistRelationEdgeSchema = z.object({
  relationType: AnilistRelationTypeSchema,
  node: AnilistRelationNodeSchema,
})
export type AnilistRelationEdge = z.infer<typeof AnilistRelationEdgeSchema>

export const AnilistRelationsSchema = z.object({
  edges: z.array(AnilistRelationEdgeSchema),
})

export const AnilistMediaSchema = z.object({
  id: z.number(),
  idMal: z.number().nullable().optional(),
  type: AnilistMediaTypeSchema,
  format: AnilistMediaFormatSchema.nullable().optional(),
  status: z.string().nullable().optional(),
  title: AnilistTitleSchema,
  description: z.string().nullable().optional(),
  startDate: AnilistFuzzyDateSchema,
  endDate: AnilistFuzzyDateSchema.optional(),
  season: z.string().nullable().optional(),
  seasonYear: z.number().nullable().optional(),
  episodes: z.number().nullable().optional(),
  chapters: z.number().nullable().optional(),
  volumes: z.number().nullable().optional(),
  duration: z.number().nullable().optional(),
  genres: z.array(z.string()).optional(),
  averageScore: z.number().nullable().optional(),
  popularity: z.number().nullable().optional(),
  coverImage: AnilistCoverImageSchema.optional(),
  bannerImage: z.string().nullable().optional(),
  studios: AnilistStudiosSchema.optional(),
  source: z.string().nullable().optional(),
  isAdult: z.boolean().optional(),
  relations: AnilistRelationsSchema.optional(),
})
export type AnilistMedia = z.infer<typeof AnilistMediaSchema>

const AnilistPageInfoSchema = z.object({
  total: z.number().optional(),
  perPage: z.number().optional(),
  currentPage: z.number().optional(),
  lastPage: z.number().optional(),
  hasNextPage: z.boolean().optional(),
})

const AnilistSearchPageSchema = z.object({
  Page: z.object({
    pageInfo: AnilistPageInfoSchema.optional(),
    media: z.array(AnilistMediaSchema),
  }),
})

const AnilistGetMediaSchema = z.object({
  Media: AnilistMediaSchema,
})

const AnilistGetRelationsSchema = z.object({
  Media: z.object({
    id: z.number(),
    relations: AnilistRelationsSchema,
  }),
})

const AnilistGraphQLErrorSchema = z.object({
  message: z.string(),
  status: z.number().optional(),
  locations: z
    .array(z.object({ line: z.number(), column: z.number() }))
    .optional(),
})

// NFR14: AniList fuzzy dates may have null month or day. `new Date(year, null, null)`
// produces "Invalid Date" silently. Always build via (month ?? 1) - 1, day ?? 1.
// Returns null when year is null (no anchor); callers map that to a sentinel.
export function partialDateToDate(
  year: number | null,
  month: number | null,
  day: number | null,
): Date | null {
  if (year === null) return null
  return new Date(year, (month ?? 1) - 1, day ?? 1)
}

const inflight = new Set<Promise<unknown>>()
async function withLimit<T>(fn: () => Promise<T>): Promise<T> {
  while (inflight.size >= ANILIST_CONCURRENCY) {
    await Promise.race(inflight)
  }
  const p = (async () => fn())()
  inflight.add(p)
  try {
    return await p
  } finally {
    inflight.delete(p)
  }
}

async function anilistFetch<T extends z.ZodType>(
  query: string,
  variables: Record<string, unknown>,
  schema: T,
  endpointLabel: string,
): Promise<z.infer<T>> {
  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': env.ANILIST_USER_AGENT,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
      signal: AbortSignal.timeout(ANILIST_TIMEOUT_MS),
    })
  } catch (err) {
    const durationMs = Date.now() - startedAt
    const isTimeout =
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')
    logger.error(
      { endpoint: endpointLabel, durationMs, err },
      isTimeout ? 'anilist_fetch_timeout' : 'anilist_fetch_network_error',
    )
    throw new AnilistApiError(
      isTimeout
        ? `AniList request timed out after ${ANILIST_TIMEOUT_MS}ms: ${endpointLabel}`
        : `AniList fetch failed: ${endpointLabel}`,
      { endpoint: endpointLabel, cause: err },
    )
  }

  const durationMs = Date.now() - startedAt

  if (response.status === 429) {
    const retryAfterRaw = response.headers.get('Retry-After')
    const retryAfterSeconds = retryAfterRaw ? Number(retryAfterRaw) : NaN
    const retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1000
      : undefined
    logger.warn(
      { endpoint: endpointLabel, durationMs, retryAfterMs },
      'anilist_fetch_rate_limited',
    )
    throw new AnilistApiError(`AniList rate limited (429): ${endpointLabel}`, {
      endpoint: endpointLabel,
      httpStatus: 429,
      retryAfterMs,
    })
  }

  if (!response.ok) {
    logger.error(
      { endpoint: endpointLabel, status: response.status, durationMs },
      'anilist_fetch_http_error',
    )
    throw new AnilistApiError(
      `AniList HTTP ${response.status}: ${endpointLabel}`,
      { endpoint: endpointLabel, httpStatus: response.status },
    )
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch (err) {
    logger.error(
      { endpoint: endpointLabel, durationMs, err },
      'anilist_fetch_invalid_json',
    )
    throw new AnilistApiError(
      `AniList returned invalid JSON: ${endpointLabel}`,
      {
        endpoint: endpointLabel,
        httpStatus: response.status,
        cause: err,
      },
    )
  }

  // AniList returns 200 with { errors: [...] } for schema-level failures
  // (unknown field, type mismatch). Surface the first error message with the
  // same logging shape so callers can distinguish transport vs query bugs.
  if (
    typeof payload === 'object' &&
    payload !== null &&
    'errors' in payload &&
    Array.isArray((payload as { errors?: unknown }).errors)
  ) {
    const errors = (payload as { errors: unknown[] }).errors
    const first = AnilistGraphQLErrorSchema.safeParse(errors[0])
    const message = first.success ? first.data.message : 'unknown GraphQL error'
    logger.error(
      { endpoint: endpointLabel, durationMs, errors },
      'anilist_fetch_graphql_error',
    )
    throw new AnilistApiError(
      `AniList GraphQL error: ${endpointLabel} - ${message}`,
      { endpoint: endpointLabel, httpStatus: response.status },
    )
  }

  const dataEnvelope = (payload as { data?: unknown }).data ?? payload
  const parsed = schema.safeParse(dataEnvelope)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const fieldPath = issue?.path.join('.') ?? '(root)'
    logger.error(
      {
        endpoint: endpointLabel,
        status: response.status,
        durationMs,
        fieldPath,
        err: parsed.error,
      },
      'anilist_fetch_parse_error',
    )
    throw new AnilistApiError(
      `AniList response parse failed at "${fieldPath}": ${endpointLabel}`,
      {
        endpoint: endpointLabel,
        httpStatus: response.status,
        fieldPath,
        cause: parsed.error,
      },
    )
  }

  return parsed.data
}

const MEDIA_FIELDS = `
  id
  idMal
  type
  format
  status
  title { romaji english native userPreferred }
  description(asHtml: false)
  startDate { year month day }
  endDate { year month day }
  season
  seasonYear
  episodes
  chapters
  volumes
  duration
  genres
  averageScore
  popularity
  coverImage { extraLarge large medium color }
  bannerImage
  studios { nodes { id name isAnimationStudio } }
  source
  isAdult
`

const RELATIONS_FRAGMENT = `
  relations {
    edges {
      relationType
      node {
        id
        type
        format
        title { romaji english native userPreferred }
        coverImage { extraLarge large medium }
      }
    }
  }
`

const SEARCH_QUERY = `
  query Search($search: String!, $type: MediaType!) {
    Page(page: 1, perPage: 25) {
      pageInfo { total perPage currentPage lastPage hasNextPage }
      media(search: $search, type: $type, sort: SEARCH_MATCH) {
        ${MEDIA_FIELDS}
      }
    }
  }
`

const GET_MEDIA_QUERY = `
  query GetMedia($id: Int!, $type: MediaType!) {
    Media(id: $id, type: $type) {
      ${MEDIA_FIELDS}
      ${RELATIONS_FRAGMENT}
    }
  }
`

const GET_RELATIONS_QUERY = `
  query GetRelations($id: Int!) {
    Media(id: $id) {
      id
      ${RELATIONS_FRAGMENT}
    }
  }
`

export function searchAnime(query: string): Promise<AnilistMedia[]> {
  return withLimit(async () => {
    const result = await anilistFetch(
      SEARCH_QUERY,
      { search: query, type: 'ANIME' },
      AnilistSearchPageSchema,
      'search/anime',
    )
    return result.Page.media
  })
}

export function searchManga(query: string): Promise<AnilistMedia[]> {
  return withLimit(async () => {
    const result = await anilistFetch(
      SEARCH_QUERY,
      { search: query, type: 'MANGA' },
      AnilistSearchPageSchema,
      'search/manga',
    )
    return result.Page.media
  })
}

export function getMedia(
  id: number,
  format: AnilistMediaType,
): Promise<AnilistMedia> {
  return withLimit(async () => {
    const result = await anilistFetch(
      GET_MEDIA_QUERY,
      { id, type: format },
      AnilistGetMediaSchema,
      `media/${format.toLowerCase()}/${id}`,
    )
    return result.Media
  })
}

export interface AnilistRelationBuckets {
  sequel: AnilistRelationNode[]
  prequel: AnilistRelationNode[]
  sideStory: AnilistRelationNode[]
  parent: AnilistRelationNode[]
  adaptation: AnilistRelationNode[]
}

export function getMediaRelations(
  id: number,
): Promise<AnilistRelationBuckets> {
  return withLimit(async () => {
    const result = await anilistFetch(
      GET_RELATIONS_QUERY,
      { id },
      AnilistGetRelationsSchema,
      `media/relations/${id}`,
    )
    const buckets: AnilistRelationBuckets = {
      sequel: [],
      prequel: [],
      sideStory: [],
      parent: [],
      adaptation: [],
    }
    for (const edge of result.Media.relations.edges) {
      switch (edge.relationType) {
        case 'SEQUEL':
          buckets.sequel.push(edge.node)
          break
        case 'PREQUEL':
          buckets.prequel.push(edge.node)
          break
        case 'SIDE_STORY':
          buckets.sideStory.push(edge.node)
          break
        case 'PARENT':
          buckets.parent.push(edge.node)
          break
        case 'ADAPTATION':
          buckets.adaptation.push(edge.node)
          break
        default:
          // Other relation types (CHARACTER, SPIN_OFF, etc.) are not surfaced
          // in the relations panel; raw edges remain available via getMedia().
          break
      }
    }
    return buckets
  })
}
