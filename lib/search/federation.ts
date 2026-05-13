import { searchMulti, type TmdbSearchMultiResult } from '@/lib/api/tmdb'

export type SearchType = 'movie' | 'tv' | 'anime' | 'game'

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
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
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

export const ADAPTERS: readonly AdapterCapability[] = [tmdbAdapter]

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
    const key = `${normaliseTitle(result.title)}::${result.release_year ?? 0}`
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
