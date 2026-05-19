import { searchMulti, type TmdbSearchMultiResult } from '@/lib/api/tmdb'
import {
  searchAnime,
  searchManga,
  type AnilistMedia,
} from '@/lib/api/anilist'
import { logger } from '@/lib/logger'

export type SearchType = 'movie' | 'tv' | 'anime' | 'manga' | 'game'

export type SearchSource = 'tmdb' | 'anilist' | 'igdb' | 'steam'

export type UnifiedSearchResult = {
  type: Exclude<SearchType, never>
  title: string
  release_year?: number
  poster_path?: string | null
  overview?: string | null
  primary_source: SearchSource
  tmdb_id?: number
  anilist_id?: number
  igdb_id?: number
  steam_id?: number
  confidence: number
}

export type AdapterCapability = {
  source: SearchSource
  supportedTypes: readonly SearchType[]
  search: (
    query: string,
    type: SearchType | undefined,
  ) => Promise<UnifiedSearchResult[]>
}

export function normaliseTitle(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

function extractYear(dateString: string | undefined | null): number | undefined {
  if (!dateString) return undefined
  const match = /^(\d{4})/.exec(dateString)
  return match ? Number.parseInt(match[1], 10) : undefined
}

function adaptTmdbResult(
  result: TmdbSearchMultiResult,
): UnifiedSearchResult | null {
  if (result.media_type === 'person') return null

  if (result.media_type === 'movie') {
    return {
      type: 'movie',
      title: result.title,
      release_year: extractYear(result.release_date),
      poster_path: result.poster_path ?? null,
      overview: result.overview ?? null,
      primary_source: 'tmdb',
      tmdb_id: result.id,
      confidence: 1.0,
    }
  }

  return {
    type: 'tv',
    title: result.name,
    release_year: extractYear(result.first_air_date),
    poster_path: result.poster_path ?? null,
    overview: result.overview ?? null,
    primary_source: 'tmdb',
    tmdb_id: result.id,
    confidence: 1.0,
  }
}

const tmdbAdapter: AdapterCapability = {
  source: 'tmdb',
  supportedTypes: ['movie', 'tv'] as const,
  async search(query, type) {
    const response = await searchMulti(query)
    const mapped = response.results
      .map(adaptTmdbResult)
      .filter((r): r is UnifiedSearchResult => r !== null)
    if (type === undefined) return mapped
    return mapped.filter((r) => r.type === type)
  },
}

// AniList covers serve as full https URLs from s4.anilist.co; the unified
// poster_path field stores them verbatim. Story 8.4's render helper will
// branch on startsWith('http') to skip TMDB-style URL construction.
function preferredAnilistTitle(t: AnilistMedia['title']): string {
  return t.userPreferred ?? t.romaji ?? t.english ?? t.native ?? ''
}

function pickAnilistCover(c: AnilistMedia['coverImage']): string | null {
  return c?.extraLarge ?? c?.large ?? c?.medium ?? null
}

function adaptAnilistResult(
  raw: AnilistMedia,
  type: 'anime' | 'manga',
): UnifiedSearchResult {
  return {
    type,
    title: preferredAnilistTitle(raw.title),
    release_year: raw.startDate.year ?? undefined,
    poster_path: pickAnilistCover(raw.coverImage),
    overview: raw.description ?? null,
    primary_source: 'anilist',
    anilist_id: raw.id,
    confidence: 1.0,
  }
}

const anilistAdapter: AdapterCapability = {
  source: 'anilist',
  supportedTypes: ['anime', 'manga'] as const,
  async search(query, type) {
    // type === undefined hits both anime + manga (federated search with no
    // filter); explicit anime / manga hits one. The adapter-level limiter in
    // lib/api/anilist enforces the 90 req/min ceiling across both calls.
    if (type === 'anime') {
      const anime = await searchAnime(query)
      return anime.map((m) => adaptAnilistResult(m, 'anime'))
    }
    if (type === 'manga') {
      const manga = await searchManga(query)
      return manga.map((m) => adaptAnilistResult(m, 'manga'))
    }
    // Promise.allSettled (not Promise.all): if anime succeeds with 25 results
    // but manga rejects (or vice versa), we must surface the half that
    // succeeded rather than discarding both. Pre-fix code used Promise.all
    // which short-circuited on the first rejection - the outer route's
    // Promise.allSettled then marked the entire anilist adapter as failed,
    // silently throwing away valid manga rows when anime's 429'd. ECH-8-3-1.
    // If BOTH inner calls reject we still throw, so the outer route can flag
    // partialFailure correctly.
    const [animeResult, mangaResult] = await Promise.allSettled([
      searchAnime(query),
      searchManga(query),
    ])
    if (
      animeResult.status === 'rejected' &&
      mangaResult.status === 'rejected'
    ) {
      // Re-throw anime's rejection (the first-listed); the route's outer
      // Promise.allSettled will record the adapter as failed and set
      // partialFailure: true. The specific error identity is preserved so a
      // 429 surfaces as a 429 in the warn log.
      throw animeResult.reason
    }
    const merged: UnifiedSearchResult[] = []
    if (animeResult.status === 'fulfilled') {
      merged.push(
        ...animeResult.value.map((m) => adaptAnilistResult(m, 'anime')),
      )
    } else {
      // Log the half-failure so partial AniList degradation is observable
      // even though the outer route's partialFailure stays false (the adapter
      // returned results overall). A per-source partialFailure surface in the
      // response contract is tracked in deferred-work.md (ECH-8-3-10).
      logger.warn(
        { event: 'anilist.partial_failure', branch: 'anime', err: animeResult.reason },
        'AniList anime search rejected while manga succeeded',
      )
    }
    if (mangaResult.status === 'fulfilled') {
      merged.push(
        ...mangaResult.value.map((m) => adaptAnilistResult(m, 'manga')),
      )
    } else {
      logger.warn(
        { event: 'anilist.partial_failure', branch: 'manga', err: mangaResult.reason },
        'AniList manga search rejected while anime succeeded',
      )
    }
    return merged
  },
}

export const ADAPTERS: readonly AdapterCapability[] = [
  tmdbAdapter,
  anilistAdapter,
]

const CONFIDENCE_LADDER: Record<number, number> = {
  1: 1.0,
  2: 0.9,
}

function confidenceFor(sourceCount: number): number {
  if (sourceCount <= 1) return CONFIDENCE_LADDER[1]
  if (sourceCount === 2) return CONFIDENCE_LADDER[2]
  return 0.8
}

export function dedupResults(
  results: UnifiedSearchResult[],
): UnifiedSearchResult[] {
  const byKey = new Map<string, UnifiedSearchResult>()
  for (const result of results) {
    // Include `type` in the dedup key so a movie + TV show with the same
    // normalised title and release year (e.g. "The Office" 2001) stay as
    // separate results: they're distinct items that route to different
    // MediaType enum values on add. Trade-off worth flagging when Epic 8
    // lands: a TMDB `tv` row + an AniList `anime` row for the same
    // canonical work will NOT merge under this key. Revisit when the
    // multi-source confidence ladder needs cross-type equivalence.
    const key = `${normaliseTitle(result.title)}::${result.release_year ?? 0}::${result.type}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, { ...result })
      continue
    }
    const merged: UnifiedSearchResult = {
      ...existing,
      tmdb_id: existing.tmdb_id ?? result.tmdb_id,
      anilist_id: existing.anilist_id ?? result.anilist_id,
      igdb_id: existing.igdb_id ?? result.igdb_id,
      steam_id: existing.steam_id ?? result.steam_id,
    }
    const sourceCount = [
      merged.tmdb_id,
      merged.anilist_id,
      merged.igdb_id,
      merged.steam_id,
    ].filter((id) => id !== undefined).length
    merged.confidence = confidenceFor(sourceCount)
    byKey.set(key, merged)
  }
  return Array.from(byKey.values())
}
