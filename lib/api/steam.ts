import { z } from 'zod'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { parseRetryAfter, summariseZodError } from '@/lib/api/zod-error'

const STEAM_BASE_URL = 'https://api.steampowered.com'
const STEAM_TIMEOUT_MS = 8000

// Steam Web API documents 100,000 calls/day with no per-second limit. The
// sync job (lib/jobs/steamAchievementSync.ts) iterates games sequentially,
// which is the effective rate cap. No slot limiter here.

// One initial attempt + up to 3 retries on 429/5xx (backoffs 1s, 2s, 4s).
const RETRY_BACKOFFS_MS = [1000, 2000, 4000] as const

// Upper cap on honoured Retry-After. Without a clamp, a misbehaving upstream
// can pin a BullMQ job for hours (Bundle A code-review finding).
const MAX_RETRY_BACKOFF_MS = 30_000

export class SteamApiError extends Error {
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
    this.name = 'SteamApiError'
    this.endpoint = opts.endpoint
    this.httpStatus = opts.httpStatus
    this.fieldPath = opts.fieldPath
    this.retryAfterMs = opts.retryAfterMs
  }
}

export const SteamOwnedGameSchema = z.object({
  appid: z.number().int(),
  name: z.string(),
  playtime_forever: z.number().int().default(0),
  img_icon_url: z.string().nullable().optional(),
  rtime_last_played: z.number().int().nullable().optional(),
})
export type SteamOwnedGame = z.infer<typeof SteamOwnedGameSchema>

const SteamOwnedGamesResponseSchema = z.object({
  response: z
    .object({
      game_count: z.number().int().optional(),
      games: z.array(SteamOwnedGameSchema).optional(),
    })
    .default({}),
})

const SteamPlayerAchievementEntrySchema = z.object({
  apiname: z.string(),
  achieved: z.union([z.literal(0), z.literal(1)]),
  unlocktime: z.number().int(),
})

const SteamPlayerAchievementsResponseSchema = z.object({
  playerstats: z.object({
    steamID: z.string().optional(),
    gameName: z.string().optional(),
    success: z.boolean(),
    error: z.string().optional(),
    achievements: z.array(SteamPlayerAchievementEntrySchema).optional(),
  }),
})

export const SteamAchievementSchemaEntrySchema = z.object({
  name: z.string(),
  displayName: z.string(),
  description: z.string().nullable().optional(),
  icon: z.string(),
  icongray: z.string().optional(),
})
export type SteamAchievementSchemaEntry = z.infer<
  typeof SteamAchievementSchemaEntrySchema
>

const SteamGameSchemaResponseSchema = z.object({
  game: z
    .object({
      availableGameStats: z
        .object({
          achievements: z.array(SteamAchievementSchemaEntrySchema).optional(),
        })
        .optional(),
    })
    .default({}),
})

const SteamGlobalPercentageEntrySchema = z.object({
  name: z.string(),
  percent: z.number(),
})

const SteamGlobalPercentagesResponseSchema = z.object({
  achievementpercentages: z
    .object({
      achievements: z.array(SteamGlobalPercentageEntrySchema).optional(),
    })
    .default({}),
})

export type SteamAchievementSyncEntry = {
  steam_api_name: string
  unlocked: boolean
  unlocked_at: Date | null
  percent_global: number | null
}

export type SteamPlayerAchievementsResult =
  | { status: 'private_profile'; appId: string }
  | {
      status: 'ok'
      appId: string
      achievements: SteamAchievementSyncEntry[]
    }

async function steamFetch<T extends z.ZodType>(
  url: string,
  schema: T,
  endpointLabel: string,
): Promise<z.infer<T>> {
  for (let attempt = 0; attempt <= RETRY_BACKOFFS_MS.length; attempt++) {
    const startedAt = Date.now()
    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(STEAM_TIMEOUT_MS),
      })
    } catch (err) {
      const durationMs = Date.now() - startedAt
      const isTimeout =
        err instanceof Error &&
        (err.name === 'TimeoutError' || err.name === 'AbortError')
      logger.error(
        {
          event: 'steam.fetch.network_error',
          endpoint: endpointLabel,
          durationMs,
          err,
        },
        isTimeout ? 'steam_fetch_timeout' : 'steam_fetch_network_error',
      )
      throw new SteamApiError(
        isTimeout
          ? `Steam request timed out after ${STEAM_TIMEOUT_MS}ms: ${endpointLabel}`
          : `Steam fetch failed: ${endpointLabel}`,
        { endpoint: endpointLabel, cause: err },
      )
    }

    const durationMs = Date.now() - startedAt

    if (response.status === 429 || response.status >= 500) {
      const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'))

      if (attempt < RETRY_BACKOFFS_MS.length) {
        const baseBackoff = RETRY_BACKOFFS_MS[attempt]!
        const backoffMs = Math.min(
          Math.max(baseBackoff, retryAfterMs ?? 0),
          MAX_RETRY_BACKOFF_MS,
        )
        logger.warn(
          {
            event: 'steam.fetch.retry',
            endpoint: endpointLabel,
            attempt: attempt + 1,
            status: response.status,
            retryAfterMs,
            backoffMs,
            durationMs,
          },
          'steam_fetch_retry',
        )
        await new Promise((r) => setTimeout(r, backoffMs))
        continue
      }

      logger.error(
        {
          event: 'steam.fetch.exhausted',
          endpoint: endpointLabel,
          status: response.status,
          durationMs,
        },
        'steam_fetch_retries_exhausted',
      )
      throw new SteamApiError(
        response.status === 429
          ? `Steam rate limited (429) after ${RETRY_BACKOFFS_MS.length} retries: ${endpointLabel}`
          : `Steam HTTP ${response.status} after ${RETRY_BACKOFFS_MS.length} retries: ${endpointLabel}`,
        {
          endpoint: endpointLabel,
          httpStatus: response.status,
          retryAfterMs,
        },
      )
    }

    if (!response.ok) {
      // Mirror igdbFetch: surface a structured log line before throwing
      // so 4xx errors aren't silent at the adapter layer
      // (Bundle A code-review finding).
      logger.error(
        {
          event: 'steam.fetch.http_error',
          endpoint: endpointLabel,
          status: response.status,
          durationMs,
        },
        'steam_fetch_http_error',
      )
      throw new SteamApiError(
        `Steam HTTP ${response.status}: ${endpointLabel}`,
        { endpoint: endpointLabel, httpStatus: response.status },
      )
    }

    let payload: unknown
    try {
      payload = await response.json()
    } catch (err) {
      logger.error(
        {
          event: 'steam.fetch.invalid_json',
          endpoint: endpointLabel,
          durationMs,
          err,
        },
        'steam_fetch_invalid_json',
      )
      throw new SteamApiError(`Steam returned invalid JSON: ${endpointLabel}`, {
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
          event: 'steam.fetch.parse_error',
          endpoint: endpointLabel,
          status: response.status,
          durationMs,
          fieldPath,
          zodIssues: summariseZodError(parsed.error),
        },
        'steam_fetch_parse_error',
      )
      throw new SteamApiError(
        `Steam response parse failed at "${fieldPath}": ${endpointLabel}`,
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

  throw new SteamApiError(`Steam unreachable retry exit: ${endpointLabel}`, {
    endpoint: endpointLabel,
  })
}

export async function getOwnedGames(
  steamId: string,
): Promise<SteamOwnedGame[]> {
  const url = `${STEAM_BASE_URL}/IPlayerService/GetOwnedGames/v0001/?key=${encodeURIComponent(env.STEAM_API_KEY)}&steamid=${encodeURIComponent(steamId)}&include_appinfo=1&format=json`
  const data = await steamFetch(
    url,
    SteamOwnedGamesResponseSchema,
    `getOwnedGames/${steamId}`,
  )
  return data.response.games ?? []
}

export async function getSchemaForGame(
  appId: string,
): Promise<SteamAchievementSchemaEntry[]> {
  const url = `${STEAM_BASE_URL}/ISteamUserStats/GetSchemaForGame/v2/?key=${encodeURIComponent(env.STEAM_API_KEY)}&appid=${encodeURIComponent(appId)}&format=json`
  const data = await steamFetch(
    url,
    SteamGameSchemaResponseSchema,
    `getSchemaForGame/${appId}`,
  )
  return data.game.availableGameStats?.achievements ?? []
}

async function getGlobalAchievementPercentages(
  appId: string,
): Promise<Map<string, number>> {
  const url = `${STEAM_BASE_URL}/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v0002/?gameid=${encodeURIComponent(appId)}&format=json`
  try {
    const data = await steamFetch(
      url,
      SteamGlobalPercentagesResponseSchema,
      `getGlobalAchievementPercentages/${appId}`,
    )
    const map = new Map<string, number>()
    for (const entry of data.achievementpercentages.achievements ?? []) {
      map.set(entry.name, entry.percent)
    }
    return map
  } catch (err) {
    // Only swallow the documented "no public stats" cases (403 / 404).
    // Letting 401 (bad API key for upstream paths) or 5xx (after retries
    // exhausted) bubble surfaces real config / infra issues instead of
    // silently degrading every game's percent_global to null
    // (Bundle A code-review finding).
    if (
      err instanceof SteamApiError &&
      (err.httpStatus === 403 || err.httpStatus === 404)
    ) {
      logger.warn(
        {
          event: 'steam.fetch.global_percentages_unavailable',
          appId,
          status: err.httpStatus,
        },
        'steam_global_percentages_unavailable',
      )
      return new Map()
    }
    throw err
  }
}

export async function getPlayerAchievements(
  steamId: string,
  appId: string,
): Promise<SteamPlayerAchievementsResult> {
  const url = `${STEAM_BASE_URL}/ISteamUserStats/GetPlayerAchievements/v0001/?key=${encodeURIComponent(env.STEAM_API_KEY)}&steamid=${encodeURIComponent(steamId)}&appid=${encodeURIComponent(appId)}`

  let player: z.infer<typeof SteamPlayerAchievementsResponseSchema>
  try {
    player = await steamFetch(
      url,
      SteamPlayerAchievementsResponseSchema,
      `getPlayerAchievements/${appId}`,
    )
  } catch (err) {
    if (err instanceof SteamApiError && err.httpStatus === 403) {
      return { status: 'private_profile', appId }
    }
    throw err
  }

  if (!player.playerstats.success) {
    // Steam returns success=false for both "no achievements available" and
    // some private cases. Either way the visible state is "nothing to render";
    // the explicit 403 private-profile path is the discriminator above.
    return { status: 'ok', appId, achievements: [] }
  }

  const playerAchievements = player.playerstats.achievements ?? []

  // Skip the global-percentages round-trip when the player has no achievement
  // entries for this app. Saves one HTTP call per zero-achievement game per
  // 6h sync (Bundle A code-review finding).
  const globalPercentages =
    playerAchievements.length > 0
      ? await getGlobalAchievementPercentages(appId)
      : new Map<string, number>()

  const achievements: SteamAchievementSyncEntry[] = playerAchievements.map(
    (entry) => ({
      steam_api_name: entry.apiname,
      // Decouple `unlocked` from `unlocked_at`: Steam ships `achieved: 1` with
      // `unlocktime: 0` for pre-timestamp-era unlocks and some stat-injected
      // achievements. Treating those as "not unlocked" loses real state
      // (Bundle A code-review finding).
      unlocked: entry.achieved === 1,
      unlocked_at:
        entry.achieved === 1 && entry.unlocktime > 0
          ? new Date(entry.unlocktime * 1000)
          : null,
      percent_global: globalPercentages.get(entry.apiname) ?? null,
    }),
  )

  return { status: 'ok', appId, achievements }
}
