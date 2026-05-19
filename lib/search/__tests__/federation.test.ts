import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { UnifiedSearchResult } from '@/lib/search/federation'

const anilistMock = vi.hoisted(() => ({
  searchAnime: vi.fn(),
  searchManga: vi.fn(),
}))

vi.mock('@/lib/api/anilist', () => ({
  searchAnime: anilistMock.searchAnime,
  searchManga: anilistMock.searchManga,
}))

const tmdbMock = vi.hoisted(() => ({
  searchMulti: vi.fn(),
}))

vi.mock('@/lib/api/tmdb', () => ({
  searchMulti: tmdbMock.searchMulti,
}))

const validEnv: Record<string, string> = {
  NEXTAUTH_SECRET: 'a'.repeat(32),
  NEXTAUTH_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://tracker:password@localhost:5432/tracker',
  REDIS_URL: 'redis://localhost:6379',
  ADMIN_PASS: 'password123',
  DB_PASS: 'password',
  TMDB_API_KEY: 'tmdb-key',
  IGDB_CLIENT_ID: 'igdb-id',
  IGDB_CLIENT_SECRET: 'igdb-secret',
  STEAM_API_KEY: 'steam-key',
  STEAM_USER_ID: '76561197960287930',
  QBITTORRENT_HOST: 'http://qbittorrent:8080',
  QBITTORRENT_USER: 'admin',
  QBITTORRENT_PASS: 'qbpass',
  DOWNLOAD_PATH: '/downloads',
  LOG_LEVEL: 'info',
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
  // Default both adapter calls to empty so dedup/title-normalisation tests
  // that don't care about adapter wiring keep working untouched.
  anilistMock.searchAnime.mockResolvedValue([])
  anilistMock.searchManga.mockResolvedValue([])
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function movie(
  title: string,
  year: number,
  tmdbId: number,
): UnifiedSearchResult {
  return {
    type: 'movie',
    title,
    release_year: year,
    primary_source: 'tmdb',
    tmdb_id: tmdbId,
    confidence: 1.0,
  }
}

function tvShow(
  title: string,
  year: number,
  tmdbId: number,
): UnifiedSearchResult {
  return {
    type: 'tv',
    title,
    release_year: year,
    primary_source: 'tmdb',
    tmdb_id: tmdbId,
    confidence: 1.0,
  }
}

describe('lib/search/federation: normaliseTitle', () => {
  it('lowercases and strips non-alphanumeric characters', async () => {
    const { normaliseTitle } = await import('@/lib/search/federation')

    expect(normaliseTitle('Fight Club')).toBe('fightclub')
    expect(normaliseTitle('Spider-Man: No Way Home')).toBe(
      'spidermannowayhome',
    )
    expect(normaliseTitle("Schindler's List")).toBe('schindlerslist')
  })

  it('keeps numbers in titles', async () => {
    const { normaliseTitle } = await import('@/lib/search/federation')

    expect(normaliseTitle('Se7en')).toBe('se7en')
    expect(normaliseTitle('Catch-22')).toBe('catch22')
  })

  it('treats different punctuation as the same key', async () => {
    const { normaliseTitle } = await import('@/lib/search/federation')

    expect(normaliseTitle('Fight Club')).toBe(normaliseTitle('fight-club'))
    expect(normaliseTitle('Star Wars')).toBe(normaliseTitle('Star/Wars'))
  })

  it('keeps "The Office" (US) vs "The Office" (UK) distinct via year axis', async () => {
    const { normaliseTitle } = await import('@/lib/search/federation')

    expect(normaliseTitle('The Office')).toBe('theoffice')
  })

  it('preserves non-Latin characters (Japanese / Korean / Chinese) for anime + manga matching', async () => {
    const { normaliseTitle } = await import('@/lib/search/federation')

    expect(normaliseTitle('進撃の巨人')).toBe('進撃の巨人')
    expect(normaliseTitle('ワンピース')).toBe('ワンピース')
    expect(normaliseTitle('진격의 거인')).toBe('진격의거인')
  })

  it('preserves accented characters via NFC (Pokémon stays Pokémon)', async () => {
    const { normaliseTitle } = await import('@/lib/search/federation')

    expect(normaliseTitle('Pokémon')).toBe('pokémon')
    expect(normaliseTitle('Léon')).toBe('léon')
    expect(normaliseTitle('Spinal Tap')).toBe('spinaltap')
  })

  it('treats canonically equivalent Unicode sequences as the same key (NFC)', async () => {
    const { normaliseTitle } = await import('@/lib/search/federation')

    const composed = 'café'
    const decomposed = 'café'
    expect(normaliseTitle(composed)).toBe(normaliseTitle(decomposed))
  })
})

describe('lib/search/federation: dedupResults', () => {
  it('passes single-source results through unchanged with confidence 1.0', async () => {
    const { dedupResults } = await import('@/lib/search/federation')
    const input = [movie('Fight Club', 1999, 550)]

    const result = dedupResults(input)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ tmdb_id: 550, confidence: 1.0 })
  })

  it('merges two-source matches with confidence 0.9', async () => {
    const { dedupResults } = await import('@/lib/search/federation')
    const tmdbResult = movie('Fight Club', 1999, 550)
    const anilistResult: UnifiedSearchResult = {
      ...movie('fight-club', 1999, 0),
      tmdb_id: undefined,
      anilist_id: 1234,
      primary_source: 'anilist',
    }

    const result = dedupResults([tmdbResult, anilistResult])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      tmdb_id: 550,
      anilist_id: 1234,
      confidence: 0.9,
    })
  })

  it('drops confidence to 0.8 on three-source matches', async () => {
    const { dedupResults } = await import('@/lib/search/federation')
    const a: UnifiedSearchResult = movie('Fight Club', 1999, 550)
    const b: UnifiedSearchResult = {
      ...movie('fight club', 1999, 0),
      tmdb_id: undefined,
      anilist_id: 1234,
      primary_source: 'anilist',
    }
    const c: UnifiedSearchResult = {
      ...movie('FightClub', 1999, 0),
      tmdb_id: undefined,
      igdb_id: 9999,
      primary_source: 'igdb',
    }

    const result = dedupResults([a, b, c])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      tmdb_id: 550,
      anilist_id: 1234,
      igdb_id: 9999,
      confidence: 0.8,
    })
  })

  it('does NOT merge results whose release_year differs (The Office US vs UK)', async () => {
    const { dedupResults } = await import('@/lib/search/federation')
    const us = movie('The Office', 2005, 2316)
    const uk = movie('The Office', 2001, 2606)

    const result = dedupResults([us, uk])

    expect(result).toHaveLength(2)
  })

  it('uses 0 as the year-key when release_year is undefined (still groups by title)', async () => {
    const { dedupResults } = await import('@/lib/search/federation')
    const a: UnifiedSearchResult = {
      ...movie('Untitled', 0, 1),
      release_year: undefined,
    }
    const b: UnifiedSearchResult = {
      ...movie('untitled', 0, 0),
      release_year: undefined,
      tmdb_id: undefined,
      anilist_id: 5,
      primary_source: 'anilist',
    }

    const result = dedupResults([a, b])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ tmdb_id: 1, anilist_id: 5 })
  })

  it('does not mutate the input array entries', async () => {
    const { dedupResults } = await import('@/lib/search/federation')
    const input = [movie('Fight Club', 1999, 550)]
    const inputCopy = JSON.parse(JSON.stringify(input))

    dedupResults(input)

    expect(input).toEqual(inputCopy)
  })

  it('returns an empty array when given empty input', async () => {
    const { dedupResults } = await import('@/lib/search/federation')

    expect(dedupResults([])).toEqual([])
  })

  it('keeps a movie and a TV show with same title + year as separate entries (AC-3)', async () => {
    const { dedupResults } = await import('@/lib/search/federation')
    const officeMovie = movie('The Office', 2001, 9999)
    const officeTv = tvShow('The Office', 2001, 2606)

    const result = dedupResults([officeMovie, officeTv])

    expect(result).toHaveLength(2)
    const movieRow = result.find((r) => r.type === 'movie')
    const tvRow = result.find((r) => r.type === 'tv')
    expect(movieRow?.tmdb_id).toBe(9999)
    expect(tvRow?.tmdb_id).toBe(2606)
    expect(movieRow?.confidence).toBe(1.0)
    expect(tvRow?.confidence).toBe(1.0)
  })
})


describe('lib/search/federation: anilistAdapter (Story 8.3)', () => {
  function anilistMedia(
    id: number,
    type: 'ANIME' | 'MANGA',
    overrides: Partial<{ title: string; year: number | null }> = {},
  ) {
    return {
      id,
      type,
      title: {
        romaji: overrides.title ?? `Title ${id}`,
        english: null,
        native: null,
        userPreferred: overrides.title ?? `Title ${id}`,
      },
      startDate: {
        year: overrides.year === undefined ? 2020 : overrides.year,
        month: null,
        day: null,
      },
      description: null,
      coverImage: { large: `https://cdn.example/${id}.jpg` },
    }
  }

  it('is registered with source: anilist and supports anime + manga', async () => {
    const { ADAPTERS } = await import('@/lib/search/federation')
    const anilist = ADAPTERS.find((a) => a.source === 'anilist')
    expect(anilist).toBeDefined()
    expect(anilist?.supportedTypes).toEqual(['anime', 'manga'])
  })

  it('type=anime calls searchAnime only, returns unified results with anilist_id and type=anime', async () => {
    anilistMock.searchAnime.mockResolvedValue([
      anilistMedia(170942, 'ANIME', { title: 'Sousou no Frieren', year: 2023 }),
    ])
    const { ADAPTERS } = await import('@/lib/search/federation')
    const anilist = ADAPTERS.find((a) => a.source === 'anilist')!

    const results = await anilist.search('frieren', 'anime')

    expect(anilistMock.searchAnime).toHaveBeenCalledWith('frieren')
    expect(anilistMock.searchManga).not.toHaveBeenCalled()
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      type: 'anime',
      title: 'Sousou no Frieren',
      anilist_id: 170942,
      primary_source: 'anilist',
      release_year: 2023,
      confidence: 1.0,
    })
  })

  it('type=manga calls searchManga only, returns type=manga results', async () => {
    anilistMock.searchManga.mockResolvedValue([
      anilistMedia(30002, 'MANGA', { title: 'Berserk', year: 1989 }),
    ])
    const { ADAPTERS } = await import('@/lib/search/federation')
    const anilist = ADAPTERS.find((a) => a.source === 'anilist')!

    const results = await anilist.search('berserk', 'manga')

    expect(anilistMock.searchManga).toHaveBeenCalledWith('berserk')
    expect(anilistMock.searchAnime).not.toHaveBeenCalled()
    expect(results[0]).toMatchObject({
      type: 'manga',
      title: 'Berserk',
      anilist_id: 30002,
    })
  })

  it('type=undefined calls BOTH searchAnime + searchManga in parallel', async () => {
    anilistMock.searchAnime.mockResolvedValue([anilistMedia(1, 'ANIME')])
    anilistMock.searchManga.mockResolvedValue([anilistMedia(2, 'MANGA')])
    const { ADAPTERS } = await import('@/lib/search/federation')
    const anilist = ADAPTERS.find((a) => a.source === 'anilist')!

    const results = await anilist.search('whatever', undefined)

    expect(anilistMock.searchAnime).toHaveBeenCalledTimes(1)
    expect(anilistMock.searchManga).toHaveBeenCalledTimes(1)
    expect(results.map((r) => r.type).sort()).toEqual(['anime', 'manga'])
  })

  it('release_year is undefined when AniList reports startDate.year null', async () => {
    anilistMock.searchAnime.mockResolvedValue([
      anilistMedia(999, 'ANIME', { year: null }),
    ])
    const { ADAPTERS } = await import('@/lib/search/federation')
    const anilist = ADAPTERS.find((a) => a.source === 'anilist')!

    const results = await anilist.search('unscheduled', 'anime')

    expect(results[0]?.release_year).toBeUndefined()
  })
})
