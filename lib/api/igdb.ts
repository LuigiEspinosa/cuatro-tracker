import { z } from 'zod'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { redis } from '@/lib/redis'
import { parseRetryAfter, summariseZodError } from '@/lib/api/zod-error'

const IGDB_BASE_URL = 'https://api.igdb.com/v4'
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const IGDB_TIMEOUT_MS = 8000

// IGDB enforces 4 req/s per client. Slot-limiter mirrors lib/api/anilist.ts
// withLimit; race-safe via a settled-token in the inflight set.
const IGDB_CONCURRENCY = 4

// Refresh proactively when within 24h of expiry per AC-2. Twitch issues
// ~60-day tokens so a daily cron (AC-6) keeps the cached token fresh well
// before this threshold ever triggers an inline refresh.
const TOKEN_REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000

// One initial attempt + up to 3 retries on 429/5xx (backoffs 1s, 2s, 4s) per AC-4.
const RETRY_BACKOFFS_MS = [1000, 2000, 4000] as const

// Upper cap on honoured Retry-After. Without a clamp, a misconfigured or
// hostile upstream can pin a BullMQ job for hours and starve the rest of the
// queue (Bundle A code-review finding).
const MAX_RETRY_BACKOFF_MS = 30_000

const TOKEN_KEY = 'igdb:token'
const TOKEN_EXPIRES_AT_KEY = 'igdb:token:expiresAt'

export class IgdbApiError extends Error {
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
    this.name = 'IgdbApiError'
    this.endpoint = opts.endpoint
    this.httpStatus = opts.httpStatus
    this.fieldPath = opts.fieldPath
    this.retryAfterMs = opts.retryAfterMs
  }
}

const TwitchTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.literal('bearer'),
})

export const IgdbCoverSchema = z.object({
  id: z.number(),
  image_id: z.string(),
})
export type IgdbCover = z.infer<typeof IgdbCoverSchema>

export const IgdbScreenshotSchema = z.object({
  id: z.number(),
  image_id: z.string(),
})
export type IgdbScreenshot = z.infer<typeof IgdbScreenshotSchema>

export const IgdbGenreSchema = z.object({
  id: z.number(),
  name: z.string(),
})
export type IgdbGenre = z.infer<typeof IgdbGenreSchema>

export const IgdbPlatformSchema = z.object({
  id: z.number(),
  name: z.string(),
})
export type IgdbPlatform = z.infer<typeof IgdbPlatformSchema>

export const IgdbCompanySchema = z.object({
  id: z.number(),
  name: z.string(),
})
export type IgdbCompany = z.infer<typeof IgdbCompanySchema>

export const IgdbInvolvedCompanySchema = z.object({
  id: z.number(),
  company: IgdbCompanySchema,
  developer: z.boolean().optional(),
  publisher: z.boolean().optional(),
})
export type IgdbInvolvedCompany = z.infer<typeof IgdbInvolvedCompanySchema>

export const IgdbReleaseDateSchema = z.object({
  id: z.number(),
  y: z.number().int().nullable().optional(),
})
export type IgdbReleaseDate = z.infer<typeof IgdbReleaseDateSchema>

export const IgdbGameSchema = z.object({
  id: z.number(),
  name: z.string(),
  summary: z.string().nullable().optional(),
  first_release_date: z.number().int().nullable().optional(),
  cover: IgdbCoverSchema.nullable().optional(),
  screenshots: z.array(IgdbScreenshotSchema).optional(),
  genres: z.array(IgdbGenreSchema).optional(),
  platforms: z.array(IgdbPlatformSchema).optional(),
  involved_companies: z.array(IgdbInvolvedCompanySchema).optional(),
  release_dates: z.array(IgdbReleaseDateSchema).optional(),
})
export type IgdbGame = z.infer<typeof IgdbGameSchema>

const IgdbGamesArraySchema = z.array(IgdbGameSchema)

// ! The v4 docs describe external_games rows as carrying `category`, with
// ! category 1 meaning Steam. The live API no longer serves that field: a probe
// ! of `where category = 1 & uid = "620"` returned an empty array, not an error,
// ! while the same row carries `external_game_source: 1`. A category filter
// ! would therefore make every lookup a permanent silent no-op.
// Only the two fields the request asks for. Requiring `id` as well would rest
// the whole batch on IGDB continuing to return an unrequested field, and one row
// without it fails the array parse and the entire enrichment run.
export const IgdbExternalGameSchema = z.object({
  game: z.number(),
  uid: z.string(),
})
export type IgdbExternalGame = z.infer<typeof IgdbExternalGameSchema>

const IgdbExternalGamesArraySchema = z.array(IgdbExternalGameSchema)

// * Failure mode: uid is NOT unique on its own. The live API returns three rows
// * for uid "620": a GiantBomb row for Star Ocean, a Twitch row for Portal
// * Runner, and the Steam row for Portal 2. Dropping this filter would map a
// * Steam appid onto an unrelated game and write its release date, which is
// * strictly worse than leaving the sentinel in place because a wrong date
// * poisons both the chronological timeline and the merge scorer's year axis.
const IGDB_STEAM_SOURCE = 1

// Uids per external_games request, so a 300-game import costs 3 requests rather
// than 300. The response limit is IGDB's documented maximum and sits well above
// the worst case of one row per requested uid.
export const IGDB_BATCH_SIZE = 100
const IGDB_MAX_LIMIT = 500

// Slot limiter mirrors lib/api/anilist.ts withLimit. Each in-flight call is
// wrapped with a settled-token whose .catch swallows rejections so
// cross-caller Promise.race waiters do not inherit unrelated errors.
const inflight = new Set<Promise<unknown>>()
async function withIgdbLimit<T>(fn: () => Promise<T>): Promise<T> {
  while (inflight.size >= IGDB_CONCURRENCY) {
    await Promise.race(inflight)
  }
  const real = (async () => fn())()
  const token: Promise<unknown> = real.catch(() => undefined)
  inflight.add(token)
  try {
    return await real
  } finally {
    inflight.delete(token)
  }
}

// In-process single-flight for the Twitch token refresh. Concurrent callers
// await the same promise instead of fanning out duplicate Twitch requests.
// Cross-process collisions (Next.js + worker each refreshing simultaneously
// during a deploy boundary) are accepted per AC-2.
let inflightRefresh: Promise<{ token: string; expiresAt: number }> | null =
  null

export async function refreshIgdbToken(): Promise<{
  token: string
  expiresAt: number
}> {
  if (inflightRefresh) {
    return inflightRefresh
  }
  inflightRefresh = (async () => {
    // Send credentials in the request body, not the URL query string.
    // URL-borne secrets are vulnerable to leaking via proxy access logs,
    // undici fetch error messages, and OTel trace attributes
    // (Bundle A code-review finding).
    const params = new URLSearchParams({
      client_id: env.IGDB_CLIENT_ID,
      client_secret: env.IGDB_CLIENT_SECRET,
      grant_type: 'client_credentials',
    })

    const startedAt = Date.now()
    let response: Response
    try {
      response = await fetch(TWITCH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
        signal: AbortSignal.timeout(IGDB_TIMEOUT_MS),
      })
    } catch (err) {
      const durationMs = Date.now() - startedAt
      const isTimeout =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      logger.error(
        { event: 'igdb.token.network_error', durationMs, err },
        isTimeout ? 'igdb_token_timeout' : 'igdb_token_network_error',
      )
      throw new IgdbApiError(
        isTimeout
          ? `Twitch token request timed out after ${IGDB_TIMEOUT_MS}ms`
          : 'Twitch token request failed',
        { endpoint: 'twitch/oauth2/token', cause: err },
      )
    }

    const durationMs = Date.now() - startedAt

    if (!response.ok) {
      logger.error(
        {
          event: 'igdb.token.http_error',
          status: response.status,
          durationMs,
        },
        'igdb_token_http_error',
      )
      throw new IgdbApiError(
        `Twitch token HTTP ${response.status}`,
        { endpoint: 'twitch/oauth2/token', httpStatus: response.status },
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (err) {
      logger.error(
        { event: 'igdb.token.invalid_json', durationMs, err },
        'igdb_token_invalid_json',
      )
      throw new IgdbApiError('Twitch token returned invalid JSON', {
        endpoint: 'twitch/oauth2/token',
        httpStatus: response.status,
        cause: err,
      })
    }

    const parsed = TwitchTokenResponseSchema.safeParse(payload)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const fieldPath = issue?.path.join('.') ?? '(root)'
      logger.error(
        {
          event: 'igdb.token.parse_error',
          fieldPath,
          durationMs,
          zodIssues: summariseZodError(parsed.error),
        },
        'igdb_token_parse_error',
      )
      throw new IgdbApiError(
        `Twitch token parse failed at "${fieldPath}"`,
        {
          endpoint: 'twitch/oauth2/token',
          httpStatus: response.status,
          fieldPath,
          cause: parsed.error,
        },
      )
    }

    const expiresAt = Date.now() + parsed.data.expires_in * 1000
    // Persist both keys atomically via a pipeline so a process-kill between
    // the two writes can't leave the cache half-populated. Both keys carry
    // the same TTL so the secondary scalar never outlives the token itself
    // (Bundle A code-review finding).
    await redis
      .multi()
      .set(TOKEN_KEY, parsed.data.access_token, 'EX', parsed.data.expires_in)
      .set(TOKEN_EXPIRES_AT_KEY, String(expiresAt), 'EX', parsed.data.expires_in)
      .exec()

    logger.info(
      { event: 'igdb.token.refreshed', expiresAt, durationMs },
      'igdb token refreshed',
    )

    return { token: parsed.data.access_token, expiresAt }
  })()

  try {
    return await inflightRefresh
  } finally {
    inflightRefresh = null
  }
}

async function getIgdbToken(): Promise<string> {
  const [cached, expiresAtRaw] = await Promise.all([
    redis.get(TOKEN_KEY),
    redis.get(TOKEN_EXPIRES_AT_KEY),
  ])
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : 0
  if (cached && expiresAt - Date.now() > TOKEN_REFRESH_THRESHOLD_MS) {
    return cached
  }
  const refreshed = await refreshIgdbToken()
  return refreshed.token
}

// Wipe the cached token so the next call forces a Twitch refresh.
// Used on IGDB 401 to recover from a stale-but-not-yet-expired cache entry.
async function invalidateIgdbToken(): Promise<void> {
  await redis.del(TOKEN_KEY, TOKEN_EXPIRES_AT_KEY)
}

async function igdbFetch<T extends z.ZodType>(
  endpoint: string,
  body: string,
  schema: T,
  endpointLabel: string,
): Promise<z.infer<T>> {
  for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
    const token = await getIgdbToken()
    const startedAt = Date.now()
    let response: Response
    try {
      response = await fetch(`${IGDB_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Client-ID': env.IGDB_CLIENT_ID,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(IGDB_TIMEOUT_MS),
      })
    } catch (err) {
      const durationMs = Date.now() - startedAt
      const isTimeout =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      logger.error(
        {
          event: 'igdb.fetch.network_error',
          endpoint: endpointLabel,
          durationMs,
          err,
        },
        isTimeout ? 'igdb_fetch_timeout' : 'igdb_fetch_network_error',
      )
      throw new IgdbApiError(
        isTimeout
          ? `IGDB request timed out after ${IGDB_TIMEOUT_MS}ms: ${endpointLabel}`
          : `IGDB fetch failed: ${endpointLabel}`,
        { endpoint: endpointLabel, cause: err },
      )
    }

    const durationMs = Date.now() - startedAt

    if (response.status === 429 || response.status >= 500) {
      const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'))

      if (attempt < RETRY_BACKOFFS_MS.length) {
        const baseBackoff = RETRY_BACKOFFS_MS[attempt]!
        // Clamp the upper bound so a misbehaving upstream that sends
        // Retry-After: <huge> cannot pin the BullMQ job for hours and
        // starve the rest of the queue (Bundle A code-review finding).
        const backoffMs = Math.min(
          Math.max(baseBackoff, retryAfterMs ?? 0),
          MAX_RETRY_BACKOFF_MS,
        )
        logger.warn(
          {
            event: 'igdb.fetch.retry',
            endpoint: endpointLabel,
            attempt: attempt + 1,
            status: response.status,
            retryAfterMs,
            backoffMs,
            durationMs,
          },
          'igdb_fetch_retry',
        )
        await new Promise((r) => setTimeout(r, backoffMs))
        continue
      }

      logger.error(
        {
          event: 'igdb.fetch.exhausted',
          endpoint: endpointLabel,
          status: response.status,
          durationMs,
        },
        'igdb_fetch_retries_exhausted',
      )
      throw new IgdbApiError(
        response.status === 429
          ? `IGDB rate limited (429) after ${RETRY_BACKOFFS_MS.length} retries: ${endpointLabel}`
          : `IGDB HTTP ${response.status} after ${RETRY_BACKOFFS_MS.length} retries: ${endpointLabel}`,
        {
          endpoint: endpointLabel,
          httpStatus: response.status,
          retryAfterMs,
        },
      )
    }

    if (!response.ok) {
      logger.error(
        {
          event: 'igdb.fetch.http_error',
          endpoint: endpointLabel,
          status: response.status,
          durationMs,
        },
        'igdb_fetch_http_error',
      )
      throw new IgdbApiError(
        `IGDB HTTP ${response.status}: ${endpointLabel}`,
        { endpoint: endpointLabel, httpStatus: response.status },
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (err) {
      logger.error(
        {
          event: 'igdb.fetch.invalid_json',
          endpoint: endpointLabel,
          durationMs,
          err,
        },
        'igdb_fetch_invalid_json',
      )
      throw new IgdbApiError(`IGDB returned invalid JSON: ${endpointLabel}`, {
        endpoint: endpointLabel,
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
          event: 'igdb.fetch.parse_error',
          endpoint: endpointLabel,
          status: response.status,
          durationMs,
          fieldPath,
          zodIssues: summariseZodError(parsed.error),
        },
        'igdb_fetch_parse_error',
      )
      throw new IgdbApiError(
        `IGDB response parse failed at "${fieldPath}": ${endpointLabel}`,
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

  throw new IgdbApiError(`IGDB unreachable retry exit: ${endpointLabel}`, {
    endpoint: endpointLabel,
  })
}

// One-shot 401 recovery: on a stale-but-not-yet-expired cached token
// (Redis ahead-of-IGDB on revocation, or partial-write corruption),
// the bare `igdbFetch` would throw without ever refreshing. This wrapper
// catches the first 401, invalidates the cache, and retries once.
// (Bundle A code-review finding.)
async function igdbFetchWithAuthRetry<T extends z.ZodType>(
  endpoint: string,
  body: string,
  schema: T,
  endpointLabel: string,
): Promise<z.infer<T>> {
  try {
    return await igdbFetch(endpoint, body, schema, endpointLabel)
  } catch (err) {
    if (err instanceof IgdbApiError && err.httpStatus === 401) {
      logger.warn(
        { event: 'igdb.fetch.token_invalidated', endpoint: endpointLabel },
        'igdb_fetch_token_invalidated',
      )
      await invalidateIgdbToken()
      return igdbFetch(endpoint, body, schema, endpointLabel)
    }
    throw err
  }
}

const GAME_FIELDS =
  'fields name,summary,first_release_date,cover.image_id,screenshots.image_id,genres.name,platforms.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,release_dates.y;'

function escapeApicalypseString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function searchGames(
  query: string,
  opts: { limit?: number } = {},
): Promise<IgdbGame[]> {
  // Guard against empty / whitespace-only queries: IGDB responds 400 to
  // `search "";` and the failure surfaces as an opaque IgdbApiError.
  // Treat the empty case as "no results" at the boundary instead.
  const trimmed = query.trim()
  if (trimmed.length === 0) {
    return Promise.resolve([])
  }
  return withIgdbLimit(async () => {
    // Clamp limit to IGDB's documented [1, 500] range.
    const requestedLimit = opts.limit ?? 25
    const limit = Math.min(Math.max(requestedLimit, 1), 500)
    const body = `${GAME_FIELDS} search "${escapeApicalypseString(trimmed)}"; limit ${limit};`
    return igdbFetchWithAuthRetry(
      'games',
      body,
      IgdbGamesArraySchema,
      `search/games`,
    )
  })
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

// Exact Steam appid to IGDB game id mapping. Never a title search: an appid
// either has a mapping or it does not, and "no mapping" is a correct outcome.
export async function mapSteamAppIdsToIgdbGameIds(
  appIds: number[],
): Promise<Map<number, number>> {
  const mapping = new Map<number, number>()
  // Mirrors the searchGames empty-query guard: no input means no request.
  if (appIds.length === 0) return mapping

  const unique = [...new Set(appIds)].filter((id) => Number.isInteger(id))
  for (const batch of chunk(unique, IGDB_BATCH_SIZE)) {
    const uids = batch
      .map((id) => `"${escapeApicalypseString(String(id))}"`)
      .join(',')
    // ! sort is not cosmetic. The source filter fixes the cross-storefront
    // ! collision, but one appid can still carry several Steam-source rows (a
    // ! game plus a bundle or edition record), and the first-wins loop below
    // ! would otherwise take whichever row IGDB happened to return. Two runs of
    // ! the same backfill could then write two different release_date values
    // ! onto one row, and release_date is the timeline sort field.
    const body = `fields game,uid; where external_game_source = ${IGDB_STEAM_SOURCE} & uid = (${uids}); sort game asc; limit ${IGDB_MAX_LIMIT};`
    const rows = await withIgdbLimit(() =>
      igdbFetchWithAuthRetry(
        'external_games',
        body,
        IgdbExternalGamesArraySchema,
        'external_games/steam',
      ),
    )
    for (const row of rows) {
      const appId = Number(row.uid)
      if (!Number.isInteger(appId)) continue
      if (!mapping.has(appId)) mapping.set(appId, row.game)
    }
  }
  return mapping
}

export async function getGames(ids: number[]): Promise<IgdbGame[]> {
  if (ids.length === 0) return []

  const unique = [...new Set(ids)].filter((id) => Number.isInteger(id))
  const games: IgdbGame[] = []
  for (const batch of chunk(unique, IGDB_BATCH_SIZE)) {
    const body = `${GAME_FIELDS} where id = (${batch.join(',')}); limit ${IGDB_MAX_LIMIT};`
    const rows = await withIgdbLimit(() =>
      igdbFetchWithAuthRetry(
        'games',
        body,
        IgdbGamesArraySchema,
        'games/batch',
      ),
    )
    games.push(...rows)
  }
  return games
}

export function getGame(id: number): Promise<IgdbGame> {
  return withIgdbLimit(async () => {
    const body = `${GAME_FIELDS} where id = ${id};`
    const games = await igdbFetchWithAuthRetry(
      'games',
      body,
      IgdbGamesArraySchema,
      `games/${id}`,
    )
    const game = games[0]
    if (!game) {
      throw new IgdbApiError(`IGDB game not found: ${id}`, {
        endpoint: `games/${id}`,
        httpStatus: 404,
      })
    }
    return game
  })
}
