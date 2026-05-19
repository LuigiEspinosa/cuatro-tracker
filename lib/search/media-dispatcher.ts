import { MediaType, type Prisma } from '@prisma/client'
import { getMovie, getTv, getTvSeason } from '@/lib/api/tmdb'
import { getMedia as getAnilistMedia } from '@/lib/api/anilist'
import { normaliseTmdbMovie } from '@/lib/normalise/movie'
import { normaliseTmdbTv } from '@/lib/normalise/tv'
import { normaliseAnilistAnime } from '@/lib/normalise/anime'
import { normaliseAnilistManga } from '@/lib/normalise/manga'

export type AddMediaSource = 'tmdb' | 'anilist' | 'igdb' | 'steam'

export type NormalisedShowWithEpisodes = {
  show: Prisma.MediaItemCreateInput
  episodes: Prisma.MediaItemCreateInput[]
}

export type AddMediaDispatcher = {
  fetch: (sourceId: number) => Promise<unknown>
  normalise: (
    raw: unknown,
  ) => Prisma.MediaItemCreateInput | NormalisedShowWithEpisodes
  sourceIdKey: 'tmdb_id' | 'anilist_id' | 'igdb_id' | 'steam_id'
}

export function getDispatcher(
  source: AddMediaSource,
  type: MediaType,
): AddMediaDispatcher | null {
  if (source === 'tmdb' && type === MediaType.MOVIE) {
    return {
      fetch: (id) => getMovie(id),
      normalise: (raw) => normaliseTmdbMovie(raw),
      sourceIdKey: 'tmdb_id',
    }
  }
  if (source === 'tmdb' && type === MediaType.TV_SHOW) {
    return {
      fetch: async (id) => {
        const show = await getTv(id)
        // `seasons` is `.optional()` on TmdbTvSchema; default to [] so a
        // malformed response yields zero parallel calls (transaction still
        // runs with episodes: [], inserting the show alone).
        const seasonNumbers = (show.seasons ?? [])
          .filter((s) => (s.episode_count ?? 0) > 0)
          .map((s) => s.season_number)
        const seasons = await Promise.all(
          seasonNumbers.map((n) => getTvSeason(id, n)),
        )
        return { show, seasons }
      },
      normalise: (raw) => {
        const { show, seasons } = raw as { show: unknown; seasons: unknown[] }
        return normaliseTmdbTv(show, seasons)
      },
      sourceIdKey: 'tmdb_id',
    }
  }
  if (source === 'anilist' && type === MediaType.ANIME) {
    return {
      fetch: (id) => getAnilistMedia(id, 'ANIME'),
      normalise: (raw) => normaliseAnilistAnime(raw),
      sourceIdKey: 'anilist_id',
    }
  }
  if (source === 'anilist' && type === MediaType.MANGA) {
    return {
      fetch: (id) => getAnilistMedia(id, 'MANGA'),
      normalise: (raw) => normaliseAnilistManga(raw),
      sourceIdKey: 'anilist_id',
    }
  }
  return null
}
