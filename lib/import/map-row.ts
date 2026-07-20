import { MediaType, WatchStatus } from '@prisma/client'
import type { ImportRow } from '@/lib/import/formats'

// How the job resolves a row to a persisted MediaItem.
//   - tmdb: fetch via getDispatcher('tmdb', type) + normalise (Trakt).
//   - anilist-mal: fetch via getMediaByMalId(sourceId, ...) + normalise (MAL);
//     `sourceId` is a MAL id, NOT an AniList id, so it does NOT go through
//     getDispatcher('anilist', ...) which queries by AniList id (OI #3).
//   - steam: no adapter fetch; the job builds the GAME MediaItem directly from
//     the Steam row keyed on steam_app_id (OI #4).
export type ImportDispatch =
  | { source: 'tmdb'; sourceId: number; type: MediaType }
  | { source: 'anilist-mal'; sourceId: number; type: MediaType }
  | { source: 'steam'; sourceId: number; type: MediaType }

export function toDispatch(row: ImportRow): ImportDispatch {
  switch (row.format) {
    case 'TRAKT_JSON':
      return {
        source: 'tmdb',
        sourceId: row.tmdbId,
        type: row.mediaType === 'movie' ? MediaType.MOVIE : MediaType.TV_SHOW,
      }
    case 'MAL_XML':
      return {
        source: 'anilist-mal',
        sourceId: row.malId,
        type: row.mediaType === 'anime' ? MediaType.ANIME : MediaType.MANGA,
      }
    case 'STEAM_EXPORT':
      return {
        source: 'steam',
        sourceId: row.appid,
        type: MediaType.GAME,
      }
  }
}

export type ImportUserEntryPatch = {
  status: WatchStatus
  progress: number
  user_rating: number | null
}

// MAL `my_status` is a display string in current exports ("Watching",
// "Completed", "On-Hold", "Dropped", "Plan to Watch" / "Plan to Read") but
// older exports use the numeric code (1/2/3/4/6). Normalise both, defaulting
// to PLAN_TO_WATCH per OI #7.
function malStatusToWatchStatus(raw: string): WatchStatus {
  const key = raw.trim().toLowerCase()
  switch (key) {
    case 'watching':
    case 'reading':
    case '1':
      return WatchStatus.WATCHING
    case 'completed':
    case '2':
      return WatchStatus.COMPLETED
    case 'on-hold':
    case 'on hold':
    case '3':
      return WatchStatus.ON_HOLD
    case 'dropped':
    case '4':
      return WatchStatus.DROPPED
    case 'plan to watch':
    case 'plan to read':
    case '6':
      return WatchStatus.PLAN_TO_WATCH
    default:
      return WatchStatus.PLAN_TO_WATCH
  }
}

export function toUserEntry(row: ImportRow): ImportUserEntryPatch {
  switch (row.format) {
    case 'TRAKT_JSON':
      // Trakt movies have no progress signal; watched history maps to COMPLETED,
      // a watchlist entry to PLAN_TO_WATCH.
      return {
        status: row.watched
          ? WatchStatus.COMPLETED
          : WatchStatus.PLAN_TO_WATCH,
        progress: 0,
        user_rating: row.rating,
      }
    case 'MAL_XML':
      return {
        status: malStatusToWatchStatus(row.status),
        progress: row.progress,
        // MAL 0 means "unrated".
        user_rating: row.score > 0 ? row.score : null,
      }
    case 'STEAM_EXPORT':
      // Steam exports carry no watch status. Any recorded playtime means the
      // game has been started; achievement progress is filled by the shipped
      // 6h steamAchievementSync job, so progress starts at 0 here.
      return {
        status:
          row.playtimeForever > 0
            ? WatchStatus.WATCHING
            : WatchStatus.PLAN_TO_WATCH,
        progress: 0,
        user_rating: null,
      }
  }
}
