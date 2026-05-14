import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const loggerMock = vi.hoisted(() => ({
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: loggerMock,
  createLogger: () => loggerMock,
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
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function mockFetchOk(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  )
}

function mockFetchStatus(status: number) {
  vi.stubGlobal('fetch', vi.fn(() => new Response('', { status })))
}

function mockFetchReject(err: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err))
}

function mockFetchInvalidJson() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Response('not-json{{{', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ),
  )
}

const validMovie = {
  id: 550,
  title: 'Fight Club',
  original_title: 'Fight Club',
  overview: 'A ticking-time-bomb insomniac...',
  release_date: '1999-10-15',
  poster_path: '/poster.jpg',
  backdrop_path: '/backdrop.jpg',
  vote_average: 8.4,
  popularity: 64.2,
  genres: [{ id: 18, name: 'Drama' }],
  status: 'Released',
}

const validTv = {
  id: 1399,
  name: 'Game of Thrones',
  original_name: 'Game of Thrones',
  overview: 'Seven noble families...',
  first_air_date: '2011-04-17',
  poster_path: '/got-poster.jpg',
  backdrop_path: '/got-backdrop.jpg',
  vote_average: 8.4,
  popularity: 120.5,
  genres: [{ id: 18, name: 'Drama' }],
  status: 'Ended',
}

const validEpisode = {
  id: 63056,
  name: 'Winter Is Coming',
  overview: 'Lord Ned Stark...',
  air_date: '2011-04-17',
  episode_number: 1,
  season_number: 1,
  still_path: '/still.jpg',
  vote_average: 8.0,
  runtime: 62,
}

const validMovieCredits = {
  id: 550,
  cast: [
    {
      id: 287,
      name: 'Brad Pitt',
      character: 'Tyler Durden',
      order: 0,
      profile_path: '/bp.jpg',
    },
    {
      id: 819,
      name: 'Edward Norton',
      character: 'The Narrator',
      order: 1,
      profile_path: '/en.jpg',
    },
    {
      id: 1283,
      name: 'Helena Bonham Carter',
      character: 'Marla Singer',
      order: 2,
      profile_path: null,
    },
  ],
  crew: [
    {
      id: 7467,
      name: 'David Fincher',
      job: 'Director',
      department: 'Directing',
      profile_path: '/df.jpg',
    },
    {
      id: 7468,
      name: 'Jim Uhls',
      job: 'Screenplay',
      department: 'Writing',
      profile_path: null,
    },
  ],
}

const validSearchMultiResponse = {
  page: 1,
  results: [
    {
      media_type: 'movie',
      id: 550,
      title: 'Fight Club',
      release_date: '1999-10-15',
      poster_path: '/poster.jpg',
      vote_average: 8.4,
      popularity: 64.2,
    },
    {
      media_type: 'tv',
      id: 1399,
      name: 'Game of Thrones',
      first_air_date: '2011-04-17',
      vote_average: 8.4,
    },
    {
      media_type: 'person',
      id: 287,
      name: 'Brad Pitt',
      known_for_department: 'Acting',
    },
  ],
  total_pages: 1,
  total_results: 3,
}

const validWatchProvidersResponse = {
  id: 550,
  results: {
    US: {
      link: 'https://www.themoviedb.org/movie/550/watch?locale=US',
      flatrate: [
        { provider_id: 8, provider_name: 'Netflix', logo_path: '/n.jpg' },
      ],
    },
    CO: {
      link: 'https://www.themoviedb.org/movie/550/watch?locale=CO',
      buy: [
        { provider_id: 2, provider_name: 'Apple TV', logo_path: '/a.jpg' },
      ],
    },
  },
}

describe('lib/api/tmdb', () => {
  describe('searchMulti', () => {
    it('parses a valid /search/multi response with movie + tv + person variants', async () => {
      mockFetchOk(validSearchMultiResponse)
      const { searchMulti } = await import('@/lib/api/tmdb')

      const result = await searchMulti('Fight Club')

      expect(result.results).toHaveLength(3)
      expect(result.results[0]).toMatchObject({ media_type: 'movie', id: 550 })
      expect(result.results[1]).toMatchObject({ media_type: 'tv', id: 1399 })
      expect(result.results[2]).toMatchObject({
        media_type: 'person',
        id: 287,
      })
    })

    it('injects api_key into the request URL', async () => {
      mockFetchOk(validSearchMultiResponse)
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>
      const { searchMulti } = await import('@/lib/api/tmdb')

      await searchMulti('Fight Club')

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string
      expect(calledUrl).toContain('api_key=tmdb-key')
      expect(calledUrl).toContain('query=Fight+Club')
      expect(calledUrl).toContain('/search/multi')
    })

    it('passes cache: no-store to fetch', async () => {
      mockFetchOk(validSearchMultiResponse)
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>
      const { searchMulti } = await import('@/lib/api/tmdb')

      await searchMulti('Fight Club')

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      expect(init?.cache).toBe('no-store')
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    })

    it('throws TmdbApiError with fieldPath when a result is missing the discriminator', async () => {
      mockFetchOk({
        page: 1,
        results: [{ id: 1, title: 'no media_type' }],
        total_pages: 1,
        total_results: 1,
      })
      const { searchMulti, TmdbApiError } = await import('@/lib/api/tmdb')

      const promise = searchMulti('x')
      await expect(promise).rejects.toBeInstanceOf(TmdbApiError)
      await expect(promise).rejects.toMatchObject({
        endpoint: '/search/multi',
        fieldPath: expect.stringMatching(/^results\.0/),
      })
    })
  })

  describe('getMovie', () => {
    it('parses a valid /movie/:id response', async () => {
      mockFetchOk(validMovie)
      const { getMovie } = await import('@/lib/api/tmdb')

      const result = await getMovie(550)

      expect(result).toMatchObject({
        id: 550,
        title: 'Fight Club',
        poster_path: '/poster.jpg',
      })
    })

    it('throws TmdbApiError with fieldPath when release_date is missing', async () => {
      const { release_date: _omit, ...broken } = validMovie
      mockFetchOk(broken)
      const { getMovie, TmdbApiError } = await import('@/lib/api/tmdb')

      const promise = getMovie(550)
      await expect(promise).rejects.toBeInstanceOf(TmdbApiError)
      await expect(promise).rejects.toMatchObject({
        endpoint: '/movie/550',
        fieldPath: 'release_date',
      })
    })

    it('does NOT append append_to_response when called without options', async () => {
      mockFetchOk(validMovie)
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>
      const { getMovie } = await import('@/lib/api/tmdb')

      await getMovie(550)

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string
      expect(calledUrl).not.toContain('append_to_response')
    })

    it('with { withCredits: true } returns TmdbMovie augmented with credits.cast + credits.crew', async () => {
      mockFetchOk({ ...validMovie, credits: validMovieCredits })
      const { getMovie } = await import('@/lib/api/tmdb')

      const result = await getMovie(550, { withCredits: true })

      expect(result).toMatchObject({ id: 550, title: 'Fight Club' })
      expect(result.credits.cast).toHaveLength(3)
      expect(result.credits.crew).toHaveLength(2)
      expect(result.credits.cast[0]).toMatchObject({
        id: 287,
        name: 'Brad Pitt',
        character: 'Tyler Durden',
        order: 0,
      })
      expect(result.credits.crew[0]).toMatchObject({
        id: 7467,
        name: 'David Fincher',
        job: 'Director',
      })
    })

    it('with { withCredits: true } adds append_to_response=credits to the request URL', async () => {
      mockFetchOk({ ...validMovie, credits: validMovieCredits })
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>
      const { getMovie } = await import('@/lib/api/tmdb')

      await getMovie(550, { withCredits: true })

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string
      expect(calledUrl).toContain('/movie/550')
      expect(calledUrl).toContain('append_to_response=credits')
    })

    it('with { withCredits: true } throws TmdbApiError with fieldPath rooted under credits when a cast entry is tampered', async () => {
      mockFetchOk({
        ...validMovie,
        credits: {
          cast: [{ id: 'not-a-number' }],
          crew: [],
        },
      })
      const { getMovie, TmdbApiError } = await import('@/lib/api/tmdb')

      const promise = getMovie(550, { withCredits: true })
      await expect(promise).rejects.toBeInstanceOf(TmdbApiError)
      await expect(promise).rejects.toMatchObject({
        endpoint: '/movie/550',
        fieldPath: expect.stringMatching(/^credits\.cast\.0/),
      })
    })
  })

  describe('getMovieCredits', () => {
    it('parses a valid /movie/:id/credits response', async () => {
      mockFetchOk(validMovieCredits)
      const { getMovieCredits } = await import('@/lib/api/tmdb')

      const result = await getMovieCredits(550)

      expect(result.cast).toHaveLength(3)
      expect(result.crew).toHaveLength(2)
      expect(result.cast[0]).toMatchObject({
        id: 287,
        name: 'Brad Pitt',
        character: 'Tyler Durden',
      })
    })

    it('returns empty arrays when TMDB reports no cast and no crew', async () => {
      mockFetchOk({ id: 550, cast: [], crew: [] })
      const { getMovieCredits } = await import('@/lib/api/tmdb')

      const result = await getMovieCredits(550)

      expect(result.cast).toEqual([])
      expect(result.crew).toEqual([])
    })

    it('builds the expected /movie/:id/credits path', async () => {
      mockFetchOk(validMovieCredits)
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>
      const { getMovieCredits } = await import('@/lib/api/tmdb')

      await getMovieCredits(550)

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string
      expect(calledUrl).toContain('/movie/550/credits')
    })
  })

  describe('getTv', () => {
    it('parses a valid /tv/:id response', async () => {
      mockFetchOk(validTv)
      const { getTv } = await import('@/lib/api/tmdb')

      const result = await getTv(1399)

      expect(result).toMatchObject({
        id: 1399,
        name: 'Game of Thrones',
        first_air_date: '2011-04-17',
      })
    })

    it('throws TmdbApiError when first_air_date is the wrong type', async () => {
      mockFetchOk({ ...validTv, first_air_date: 1234 })
      const { getTv, TmdbApiError } = await import('@/lib/api/tmdb')

      const promise = getTv(1399)
      await expect(promise).rejects.toBeInstanceOf(TmdbApiError)
      await expect(promise).rejects.toMatchObject({
        fieldPath: 'first_air_date',
      })
    })
  })

  describe('getEpisode', () => {
    it('parses a valid episode response', async () => {
      mockFetchOk(validEpisode)
      const { getEpisode } = await import('@/lib/api/tmdb')

      const result = await getEpisode(1399, 1, 1)

      expect(result).toMatchObject({
        id: 63056,
        episode_number: 1,
        season_number: 1,
      })
    })

    it('builds the expected /tv/:showId/season/:season/episode/:episode path', async () => {
      mockFetchOk(validEpisode)
      const fetchMock = global.fetch as ReturnType<typeof vi.fn>
      const { getEpisode } = await import('@/lib/api/tmdb')

      await getEpisode(1399, 1, 1)

      const calledUrl = fetchMock.mock.calls[0]?.[0] as string
      expect(calledUrl).toContain('/tv/1399/season/1/episode/1')
    })

    it('throws TmdbApiError when episode_number is missing', async () => {
      const { episode_number: _omit, ...broken } = validEpisode
      mockFetchOk(broken)
      const { getEpisode, TmdbApiError } = await import('@/lib/api/tmdb')

      const promise = getEpisode(1399, 1, 1)
      await expect(promise).rejects.toBeInstanceOf(TmdbApiError)
      await expect(promise).rejects.toMatchObject({
        fieldPath: 'episode_number',
      })
    })
  })

  describe('getWatchProviders', () => {
    it('returns the requested country slice with all four arrays guaranteed present', async () => {
      mockFetchOk(validWatchProvidersResponse)
      const { getWatchProviders } = await import('@/lib/api/tmdb')

      const result = await getWatchProviders('movie', 550, 'CO')

      expect(result.link).toBe(
        'https://www.themoviedb.org/movie/550/watch?locale=CO',
      )
      expect(result.flatrate).toEqual([])
      expect(result.rent).toEqual([])
      expect(result.buy).toHaveLength(1)
      expect(result.buy[0]).toMatchObject({
        provider_id: 2,
        provider_name: 'Apple TV',
      })
    })

    it('populates flatrate when present and leaves rent + buy as empty arrays', async () => {
      mockFetchOk(validWatchProvidersResponse)
      const { getWatchProviders } = await import('@/lib/api/tmdb')

      const result = await getWatchProviders('movie', 550, 'US')

      expect(result.flatrate).toHaveLength(1)
      expect(result.flatrate[0]).toMatchObject({
        provider_id: 8,
        provider_name: 'Netflix',
      })
      expect(result.rent).toEqual([])
      expect(result.buy).toEqual([])
    })

    it('returns always-shape empty payload when the country has no providers (never null)', async () => {
      mockFetchOk(validWatchProvidersResponse)
      const { getWatchProviders } = await import('@/lib/api/tmdb')

      const result = await getWatchProviders('movie', 550, 'ZZ')

      expect(result).toEqual({ link: '', flatrate: [], rent: [], buy: [] })
    })

    it('throws TmdbApiError when the wire payload has an invalid link', async () => {
      mockFetchOk({
        id: 550,
        results: {
          US: { link: 'not-a-url', flatrate: [] },
        },
      })
      const { getWatchProviders, TmdbApiError } = await import('@/lib/api/tmdb')

      const promise = getWatchProviders('movie', 550, 'US')
      await expect(promise).rejects.toBeInstanceOf(TmdbApiError)
      await expect(promise).rejects.toMatchObject({
        fieldPath: expect.stringMatching(/results\.US\.link/),
      })
    })
  })

  describe('getImageUrl', () => {
    it('returns the full TMDB image URL when given a path + size', async () => {
      const { getImageUrl } = await import('@/lib/api/tmdb')
      expect(getImageUrl('/abc.jpg', 'w500')).toBe(
        'https://image.tmdb.org/t/p/w500/abc.jpg',
      )
    })

    it('returns null when path is null (caller-friendly nullable passthrough)', async () => {
      const { getImageUrl } = await import('@/lib/api/tmdb')
      expect(getImageUrl(null, 'w500')).toBeNull()
    })

    it('supports all documented TMDB sizes', async () => {
      const { getImageUrl } = await import('@/lib/api/tmdb')
      const sizes = [
        'w92',
        'w154',
        'w185',
        'w342',
        'w500',
        'w780',
        'original',
      ] as const
      for (const size of sizes) {
        expect(getImageUrl('/x.jpg', size)).toBe(
          `https://image.tmdb.org/t/p/${size}/x.jpg`,
        )
      }
    })
  })

  describe('HTTP failures', () => {
    it('throws TmdbApiError with httpStatus on non-2xx', async () => {
      mockFetchStatus(500)
      const { getMovie, TmdbApiError } = await import('@/lib/api/tmdb')

      const promise = getMovie(550)
      await expect(promise).rejects.toBeInstanceOf(TmdbApiError)
      await expect(promise).rejects.toMatchObject({
        endpoint: '/movie/550',
        httpStatus: 500,
      })
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/movie/550',
          status: 500,
        }),
        'tmdb_fetch_http_error',
      )
    })

    it('throws TmdbApiError with undefined httpStatus on network error', async () => {
      const networkErr = new Error('ECONNREFUSED')
      mockFetchReject(networkErr)
      const { getMovie, TmdbApiError } = await import('@/lib/api/tmdb')

      const promise = getMovie(550)
      await expect(promise).rejects.toBeInstanceOf(TmdbApiError)
      await expect(promise).rejects.toMatchObject({
        endpoint: '/movie/550',
        httpStatus: undefined,
      })
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: '/movie/550', err: networkErr }),
        'tmdb_fetch_network_error',
      )
    })

    it('throws TmdbApiError when the response body is invalid JSON', async () => {
      mockFetchInvalidJson()
      const { getMovie, TmdbApiError } = await import('@/lib/api/tmdb')

      const promise = getMovie(550)
      await expect(promise).rejects.toBeInstanceOf(TmdbApiError)
      await expect(promise).rejects.toMatchObject({
        endpoint: '/movie/550',
      })
      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: '/movie/550' }),
        'tmdb_fetch_invalid_json',
      )
    })

    it('logs at error level with fieldPath on parse failure', async () => {
      const { release_date: _omit, ...broken } = validMovie
      mockFetchOk(broken)
      const { getMovie } = await import('@/lib/api/tmdb')

      await expect(getMovie(550)).rejects.toThrow()

      expect(loggerMock.error).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: '/movie/550',
          fieldPath: 'release_date',
        }),
        'tmdb_fetch_parse_error',
      )
    })
  })
})
