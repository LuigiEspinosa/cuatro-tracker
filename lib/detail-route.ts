import { MediaType } from '@prisma/client'

type DetailRouteInput = {
  mediaType: MediaType
  mediaItemId: string
  anilistId?: number | null
}

export function detailRouteFor(item: DetailRouteInput): string | null {
  switch (item.mediaType) {
    case MediaType.MOVIE:
      return `/movies/${item.mediaItemId}`
    case MediaType.TV_SHOW:
      return `/tv/${item.mediaItemId}`
    case MediaType.ANIME:
      return `/anime/${item.mediaItemId}`
    case MediaType.MANGA:
      return item.anilistId != null
        ? `/preview/anilist/manga/${item.anilistId}`
        : null
    case MediaType.TV_EPISODE:
    case MediaType.GAME:
    default:
      return null
  }
}
