import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ZodError } from 'zod'
import { MediaType } from '@prisma/client'

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

type EpisodeOverride = Partial<{
  id: number
  name: string
  overview: string | null
  air_date: string | null
  episode_number: number
  season_number: number
  still_path: string | null
  vote_average: number
  runtime: number | null
}>

function validEpisodePayload(
  seasonNumber: number,
  episodeNumber: number,
  override: EpisodeOverride = {},
) {
  return {
    id: seasonNumber * 1000 + episodeNumber,
    name: `S${seasonNumber}E${episodeNumber}`,
    overview: 'plot summary',
    air_date: '2008-01-20',
    episode_number: episodeNumber,
    season_number: seasonNumber,
    still_path: `/still-${seasonNumber}-${episodeNumber}.jpg`,
    vote_average: 8.5,
    runtime: 45,
    ...override,
  }
}

function validSeasonPayload({
  season_number,
  episode_count,
  episodeOverride,
}: {
  season_number: number
  episode_count: number
  episodeOverride?: (epIdx: number) => EpisodeOverride
}) {
  return {
    id: 100 + season_number,
    season_number,
    name: season_number === 0 ? 'Specials' : `Season ${season_number}`,
    overview: null,
    poster_path: `/season-${season_number}.jpg`,
    air_date: '2008-01-20',
    vote_average: 8.5,
    episodes: Array.from({ length: episode_count }, (_, i) =>
      validEpisodePayload(
        season_number,
        i + 1,
        episodeOverride?.(i + 1) ?? {},
      ),
    ),
  }
}

function validTvPayload(override: Partial<{
  status: string
  last_air_date: string | null
  first_air_date: string | null
  original_name: string | undefined
  overview: string | null
  poster_path: string | null
  backdrop_path: string | null
}> = {}) {
  return {
    id: 1396,
    name: 'Breaking Bad',
    original_name: 'Breaking Bad',
    overview: 'A high school chemistry teacher...',
    first_air_date: '2008-01-20',
    last_air_date: '2013-09-29',
    poster_path: '/bb-poster.jpg',
    backdrop_path: '/bb-backdrop.jpg',
    vote_average: 8.9,
    popularity: 121.4,
    genres: [
      { id: 18, name: 'Drama' },
      { id: 80, name: 'Crime' },
    ],
    status: 'Ended',
    tagline: 'All hail the king.',
    in_production: false,
    number_of_seasons: 5,
    number_of_episodes: 62,
    ...override,
  }
}

describe('lib/normalise/tv', () => {
  describe('happy path: 2 seasons × 10 episodes', () => {
    it('returns 1 show row + 20 episode rows with correct types', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload(), [
        validSeasonPayload({ season_number: 1, episode_count: 10 }),
        validSeasonPayload({ season_number: 2, episode_count: 10 }),
      ])

      expect(result.show.type).toBe(MediaType.TV_SHOW)
      expect(result.episodes).toHaveLength(20)
      for (const episode of result.episodes) {
        expect(episode.type).toBe(MediaType.TV_EPISODE)
      }
    })

    it('maps every documented show field correctly', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload(), [])

      expect(result.show).toMatchObject({
        type: MediaType.TV_SHOW,
        title: 'Breaking Bad',
        original_title: 'Breaking Bad',
        overview: 'A high school chemistry teacher...',
        poster_path: '/bb-poster.jpg',
        backdrop_path: '/bb-backdrop.jpg',
        rating: 8.9,
        popularity: 121.4,
        status: 'Ended',
        lifecycle_status: 'ended',
        tmdb_id: 1396,
      })
      expect(result.show.genres).toEqual(['Drama', 'Crime'])
      expect((result.show.release_date as Date).toISOString()).toBe(
        '2008-01-20T00:00:00.000Z',
      )
      expect((result.show.end_date as Date).toISOString()).toBe(
        '2013-09-29T00:00:00.000Z',
      )
    })

    it('maps every documented episode field correctly', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload(), [
        validSeasonPayload({ season_number: 1, episode_count: 2 }),
      ])

      expect(result.episodes[0]).toMatchObject({
        type: MediaType.TV_EPISODE,
        title: 'S1E1',
        original_title: null,
        overview: 'plot summary',
        still_path: '/still-1-1.jpg',
        rating: 8.5,
        runtime: 45,
        season_number: 1,
        episode_number: 1,
        unaired: false,
        tmdb_id: 1001,
      })
      expect(result.episodes[0].poster_path).toBeNull()
      expect(result.episodes[0].backdrop_path).toBeNull()
      expect(result.episodes[0].popularity).toBeNull()
      expect(result.episodes[0].genres).toEqual([])
      expect((result.episodes[0].release_date as Date).toISOString()).toBe(
        '2008-01-20T00:00:00.000Z',
      )
    })
  })

  describe('unaired episode handling', () => {
    it('flags unaired: true when air_date is null', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload(), [
        validSeasonPayload({
          season_number: 1,
          episode_count: 1,
          episodeOverride: () => ({ air_date: null }),
        }),
      ])

      expect(result.episodes[0].unaired).toBe(true)
      expect((result.episodes[0].release_date as Date).toISOString()).toBe(
        '1970-01-01T00:00:00.000Z',
      )
    })

    it('flags unaired: true when air_date is an empty string', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload(), [
        validSeasonPayload({
          season_number: 1,
          episode_count: 1,
          episodeOverride: () => ({ air_date: '' }),
        }),
      ])

      expect(result.episodes[0].unaired).toBe(true)
      expect((result.episodes[0].release_date as Date).toISOString()).toBe(
        '1970-01-01T00:00:00.000Z',
      )
    })

    it('flags unaired: false on a future-dated episode (deterministic — no Date.now())', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload(), [
        validSeasonPayload({
          season_number: 1,
          episode_count: 1,
          episodeOverride: () => ({ air_date: '2099-01-01' }),
        }),
      ])

      expect(result.episodes[0].unaired).toBe(false)
      expect((result.episodes[0].release_date as Date).toISOString()).toBe(
        '2099-01-01T00:00:00.000Z',
      )
    })

    it('flags unaired: false on an aired episode', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload(), [
        validSeasonPayload({ season_number: 1, episode_count: 1 }),
      ])

      expect(result.episodes[0].unaired).toBe(false)
    })
  })

  describe('lifecycle_status mapping (LIFECYCLE_STATUS_MAP)', () => {
    const cases: Array<{ status: string; expected: string }> = [
      { status: 'Ended', expected: 'ended' },
      { status: 'Canceled', expected: 'ended' },
      { status: 'Returning Series', expected: 'continuing' },
      { status: 'In Production', expected: 'in_production' },
      { status: 'Planned', expected: 'in_production' },
      { status: 'Pilot', expected: 'in_production' },
    ]

    it.each(cases)(
      'maps TMDB status "$status" to lifecycle_status "$expected"',
      async ({ status, expected }) => {
        const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

        const result = normaliseTmdbTv(validTvPayload({ status }), [])

        expect(result.show.lifecycle_status).toBe(expected)
        expect(result.show.status).toBe(status)
      },
    )

    it('defaults unknown TMDB status to "continuing" (permissive fallback)', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(
        validTvPayload({ status: 'Limited Series' }),
        [],
      )

      expect(result.show.lifecycle_status).toBe('continuing')
      expect(result.show.status).toBe('Limited Series')
    })
  })

  describe('end_date handling', () => {
    it('preserves end_date when last_air_date is set', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(
        validTvPayload({ last_air_date: '2013-09-29' }),
        [],
      )

      expect((result.show.end_date as Date).toISOString()).toBe(
        '2013-09-29T00:00:00.000Z',
      )
    })

    it('writes null end_date when last_air_date is absent', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const { last_air_date: _omit, ...source } = validTvPayload()
      const result = normaliseTmdbTv(source, [])

      expect(result.show.end_date).toBeNull()
    })

    it('writes null end_date when last_air_date is null', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(
        validTvPayload({ last_air_date: null }),
        [],
      )

      expect(result.show.end_date).toBeNull()
    })
  })

  describe('first_air_date null coercion', () => {
    it('falls back to 1970 sentinel when first_air_date is null (mirrors normaliseTmdbMovie behaviour)', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(
        validTvPayload({ first_air_date: null }),
        [],
      )

      expect((result.show.release_date as Date).toISOString()).toBe(
        '1970-01-01T00:00:00.000Z',
      )
    })

    it('falls back to 1970 sentinel when first_air_date is an empty string', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(
        validTvPayload({ first_air_date: '' }),
        [],
      )

      expect((result.show.release_date as Date).toISOString()).toBe(
        '1970-01-01T00:00:00.000Z',
      )
    })

    it('constructs Jan 1 UTC for year-only first_air_date', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(
        validTvPayload({ first_air_date: '2024' }),
        [],
      )

      expect((result.show.release_date as Date).toISOString()).toBe(
        '2024-01-01T00:00:00.000Z',
      )
    })
  })

  describe('Specials season handling', () => {
    it('includes Specials (season_number: 0) episodes in the output', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload(), [
        validSeasonPayload({ season_number: 0, episode_count: 2 }),
        validSeasonPayload({ season_number: 1, episode_count: 3 }),
      ])

      expect(result.episodes).toHaveLength(5)
      const specials = result.episodes.filter((e) => e.season_number === 0)
      expect(specials).toHaveLength(2)
      expect(specials[0].title).toBe('S0E1')
    })

    it('preserves season-then-episode insertion order', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload(), [
        validSeasonPayload({ season_number: 2, episode_count: 2 }),
        validSeasonPayload({ season_number: 1, episode_count: 2 }),
      ])

      expect(
        result.episodes.map((e) => [e.season_number, e.episode_number]),
      ).toEqual([
        [2, 1],
        [2, 2],
        [1, 1],
        [1, 2],
      ])
    })
  })

  describe('nullable / empty source-field handling', () => {
    it('writes null original_title when original_name is absent', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(
        validTvPayload({ original_name: undefined }),
        [],
      )

      expect(result.show.original_title).toBeNull()
    })

    it('writes null overview when source overview is null', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload({ overview: null }), [])

      expect(result.show.overview).toBeNull()
    })

    it('preserves null poster_path and backdrop_path on the show row', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(
        validTvPayload({ poster_path: null, backdrop_path: null }),
        [],
      )

      expect(result.show.poster_path).toBeNull()
      expect(result.show.backdrop_path).toBeNull()
    })

    it('preserves null still_path on episode rows', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload(), [
        validSeasonPayload({
          season_number: 1,
          episode_count: 1,
          episodeOverride: () => ({ still_path: null }),
        }),
      ])

      expect(result.episodes[0].still_path).toBeNull()
    })

    it('preserves null runtime on episode rows', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload(), [
        validSeasonPayload({
          season_number: 1,
          episode_count: 1,
          episodeOverride: () => ({ runtime: null }),
        }),
      ])

      expect(result.episodes[0].runtime).toBeNull()
    })

    it('writes empty episodes array when seasons is empty', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload(), [])

      expect(result.episodes).toEqual([])
    })

    it('writes empty episodes array when a season has zero episodes', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const result = normaliseTmdbTv(validTvPayload(), [
        validSeasonPayload({ season_number: 1, episode_count: 0 }),
      ])

      expect(result.episodes).toEqual([])
    })
  })

  describe('malformed input', () => {
    it('throws ZodError when show id is wrong type', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const broken = { ...validTvPayload(), id: 'not-a-number' }

      expect(() => normaliseTmdbTv(broken, [])).toThrow(ZodError)
    })

    it('throws ZodError when a required show field is missing', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const { name: _name, ...broken } = validTvPayload()

      expect(() => normaliseTmdbTv(broken, [])).toThrow(ZodError)
    })

    it('throws ZodError when input is null or undefined', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      expect(() => normaliseTmdbTv(null, [])).toThrow(ZodError)
      expect(() => normaliseTmdbTv(undefined, [])).toThrow(ZodError)
    })

    it('throws ZodError when a season payload is malformed', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const brokenSeason = {
        ...validSeasonPayload({ season_number: 1, episode_count: 1 }),
        episodes: 'not-an-array',
      }

      expect(() => normaliseTmdbTv(validTvPayload(), [brokenSeason])).toThrow(
        ZodError,
      )
    })

    it('throws ZodError when an episode inside a season is malformed', async () => {
      const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

      const brokenSeason = validSeasonPayload({
        season_number: 1,
        episode_count: 1,
      })
      // @ts-expect-error — deliberately invalidating the fixture
      brokenSeason.episodes[0].episode_number = 'one'

      expect(() => normaliseTmdbTv(validTvPayload(), [brokenSeason])).toThrow(
        ZodError,
      )
    })
  })

  describe('NFR13 invariant: every release_date is a valid Date', () => {
    const fixtures: Array<{
      name: string
      first_air_date: string | null
      last_air_date: string | null
      episode_air_date: string | null
    }> = [
      {
        name: 'happy yyyy-mm-dd',
        first_air_date: '2008-01-20',
        last_air_date: '2013-09-29',
        episode_air_date: '2008-01-20',
      },
      {
        name: 'null first_air_date',
        first_air_date: null,
        last_air_date: null,
        episode_air_date: null,
      },
      {
        name: 'empty first_air_date',
        first_air_date: '',
        last_air_date: '',
        episode_air_date: '',
      },
      {
        name: 'year-only first_air_date',
        first_air_date: '2024',
        last_air_date: '2024',
        episode_air_date: '2024',
      },
      {
        name: 'malformed first_air_date',
        first_air_date: 'not-a-date',
        last_air_date: 'not-a-date',
        episode_air_date: 'not-a-date',
      },
    ]

    it.each(fixtures)(
      'produces a valid Date for variant "$name"',
      async ({ first_air_date, last_air_date, episode_air_date }) => {
        const { normaliseTmdbTv } = await import('@/lib/normalise/tv')

        const result = normaliseTmdbTv(
          validTvPayload({ first_air_date, last_air_date }),
          [
            validSeasonPayload({
              season_number: 1,
              episode_count: 1,
              episodeOverride: () => ({ air_date: episode_air_date }),
            }),
          ],
        )

        expect(result.show.release_date).toBeInstanceOf(Date)
        expect(
          Number.isNaN((result.show.release_date as Date).getTime()),
        ).toBe(false)
        if (result.show.end_date !== null) {
          expect(result.show.end_date).toBeInstanceOf(Date)
          expect(
            Number.isNaN((result.show.end_date as Date).getTime()),
          ).toBe(false)
        }
        for (const episode of result.episodes) {
          expect(episode.release_date).toBeInstanceOf(Date)
          expect(
            Number.isNaN((episode.release_date as Date).getTime()),
          ).toBe(false)
        }
      },
    )
  })
})
