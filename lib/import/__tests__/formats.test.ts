import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// formats.ts transitively imports @/lib/api/steam -> @/lib/env, which parses
// process.env at module load. Stub a valid env before the dynamic import so the
// boot-time schema does not throw (mirrors the anilist / steam-sync suites).
const validEnv: Record<string, string> = {
  NEXTAUTH_SECRET: 'a'.repeat(32),
  NEXTAUTH_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://tracker:password@localhost:5432/tracker',
  REDIS_URL: 'redis://localhost:6379',
  ADMIN_PASS: 'password123',
  DB_PASS: 'password',
  TMDB_API_KEY: 'tmdb-key',
  ANILIST_USER_AGENT: 'cuatro-tracker/test',
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

type FormatsModule = typeof import('@/lib/import/formats')
let formats: FormatsModule

beforeAll(async () => {
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
  formats = await import('@/lib/import/formats')
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('parseTraktJson', () => {
  it('reads tmdb ids and watched / watchlist / rating signals', () => {
    const text = JSON.stringify([
      {
        type: 'movie',
        watched_at: '2014-03-31T09:28:53.000Z',
        movie: { title: 'Inception', year: 2010, ids: { tmdb: 27205 } },
      },
      {
        type: 'show',
        last_watched_at: '2020-01-01T00:00:00.000Z',
        plays: 12,
        show: { title: 'The Wire', year: 2002, ids: { tmdb: 1438 } },
      },
      {
        type: 'movie',
        listed_at: '2021-05-05T00:00:00.000Z',
        movie: { title: 'Dune', year: 2021, ids: { tmdb: 438631 } },
      },
      {
        type: 'movie',
        rated_at: '2019-01-01T00:00:00.000Z',
        rating: 8,
        movie: { title: 'Parasite', year: 2019, ids: { tmdb: 496243 } },
      },
    ])

    const rows = formats.parseTraktJson(text)
    expect(rows).toHaveLength(4)
    expect(rows[0]).toEqual({
      format: 'TRAKT_JSON',
      tmdbId: 27205,
      mediaType: 'movie',
      title: 'Inception',
      watched: true,
      rating: null,
    })
    expect(rows[1]).toMatchObject({ mediaType: 'show', tmdbId: 1438, watched: true })
    // Watchlist-only row is not watched.
    expect(rows[2]).toMatchObject({ tmdbId: 438631, watched: false, rating: null })
    // Rating-only row carries the rating and defaults to not-watched.
    expect(rows[3]).toMatchObject({ tmdbId: 496243, watched: false, rating: 8 })
  })

  it('drops rows without a tmdb id and accepts an object wrapper', () => {
    const text = JSON.stringify({
      movies: [{ movie: { title: 'A', ids: { tmdb: 1 } } }],
      shows: [{ show: { title: 'No id', ids: {} } }],
    })
    const rows = formats.parseTraktJson(text)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tmdbId).toBe(1)
  })

  it('throws ImportParseError on invalid JSON', () => {
    expect(() => formats.parseTraktJson('not-json')).toThrow(
      formats.ImportParseError,
    )
  })

  it('throws ImportParseError when the JSON has no item array', () => {
    expect(() => formats.parseTraktJson('{"foo":"bar"}')).toThrow(
      formats.ImportParseError,
    )
  })

  it('skips a malformed record and keeps the valid rows', () => {
    const text = JSON.stringify([
      { movie: { ids: { tmdb: 1 } }, rating: 'nine' },
      { movie: { title: 'Good', ids: { tmdb: 2 } } },
    ])
    const rows = formats.parseTraktJson(text)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.tmdbId).toBe(2)
  })
})

describe('parseMalXml', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<myanimelist>
  <myinfo><user_id>1</user_id></myinfo>
  <anime>
    <series_animedb_id>21</series_animedb_id>
    <series_title>One Piece</series_title>
    <my_watched_episodes>500</my_watched_episodes>
    <my_score>9</my_score>
    <my_status>Watching</my_status>
  </anime>
  <manga>
    <manga_mangadb_id>13</manga_mangadb_id>
    <manga_title>Berserk</manga_title>
    <my_read_chapters>374</my_read_chapters>
    <my_score>10</my_score>
    <my_status>Reading</my_status>
  </manga>
</myanimelist>`

  it('parses anime and manga records', () => {
    const rows = formats.parseMalXml(xml)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      format: 'MAL_XML',
      malId: 21,
      mediaType: 'anime',
      title: 'One Piece',
      status: 'Watching',
      progress: 500,
      score: 9,
    })
    expect(rows[1]).toMatchObject({
      malId: 13,
      mediaType: 'manga',
      progress: 374,
      score: 10,
    })
  })

  it('forces a single <anime> record into an array', () => {
    const single = `<myanimelist><anime>
      <series_animedb_id>1</series_animedb_id>
      <series_title>Cowboy Bebop</series_title>
      <my_status>Completed</my_status>
    </anime></myanimelist>`
    const rows = formats.parseMalXml(single)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.malId).toBe(1)
  })

  it('skips a malformed record and keeps the valid ones', () => {
    const bad = `<myanimelist>
      <anime>
        <series_animedb_id>not-a-number</series_animedb_id>
        <my_status>Watching</my_status>
      </anime>
      <anime>
        <series_animedb_id>42</series_animedb_id>
        <my_status>Completed</my_status>
      </anime>
    </myanimelist>`
    const rows = formats.parseMalXml(bad)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.malId).toBe(42)
  })

  it('throws ImportParseError when the <myanimelist> root is missing', () => {
    expect(() => formats.parseMalXml('<foo></foo>')).toThrow(
      formats.ImportParseError,
    )
  })
})

describe('parseSteamExport', () => {
  it('validates response.games via SteamOwnedGameSchema', () => {
    const text = JSON.stringify({
      response: {
        game_count: 2,
        games: [
          {
            appid: 570,
            name: 'Dota 2',
            playtime_forever: 1200,
            rtime_last_played: 1600000000,
          },
          { appid: 730, name: 'CS2', playtime_forever: 0 },
        ],
      },
    })
    const rows = formats.parseSteamExport(text)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      format: 'STEAM_EXPORT',
      appid: 570,
      name: 'Dota 2',
      playtimeForever: 1200,
      rtimeLastPlayed: 1600000000,
    })
    // rtime_last_played absent -> null.
    expect(rows[1]?.rtimeLastPlayed).toBeNull()
  })

  it('returns an empty list when response.games is absent', () => {
    expect(formats.parseSteamExport('{"response":{}}')).toEqual([])
  })

  it('skips a malformed game and keeps the valid ones', () => {
    const text = JSON.stringify({
      response: {
        games: [
          { appid: '570', name: 'Bad appid' },
          { appid: 730, name: 'CS2', playtime_forever: 0 },
        ],
      },
    })
    const rows = formats.parseSteamExport(text)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.appid).toBe(730)
  })

  it('throws ImportParseError when the root is not an object', () => {
    expect(() => formats.parseSteamExport('123')).toThrow(
      formats.ImportParseError,
    )
  })
})
