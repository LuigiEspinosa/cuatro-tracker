import { MediaType, type Prisma } from '@prisma/client'
import { getMovie } from '@/lib/api/tmdb'
import { normaliseTmdbMovie } from '@/lib/normalise/movie'

export type AddMediaSource = 'tmdb' | 'anilist' | 'igdb' | 'steam'

export type AddMediaDispatcher = {
  fetch: (sourceId: number) => Promise<unknown>
  normalise: (raw: unknown) => Prisma.MediaItemCreateInput
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
  return null
}
