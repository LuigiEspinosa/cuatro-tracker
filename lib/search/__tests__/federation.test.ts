import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { UnifiedSearchResult } from '@/lib/search/federation'

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
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
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
})
