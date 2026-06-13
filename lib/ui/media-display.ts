import type { MediaType, WatchStatus } from '@prisma/client'
import type { PhosphorLEDStatus } from '@/components/atoms/PhosphorLED'

/* Per-medium display vocabulary shared across the library grid, media-card
 * overlay, watch-status control, search results, and the chronological
 * timeline. The maps live here, not duplicated per component, so the
 * television-metaphor labels and the WatchStatus to LED mapping stay in one
 * place once a third consumer appears (rule of three, crossed by the timeline
 * row in Story 10.4). Type-only imports keep the Prisma runtime out of any
 * client bundle that pulls this module in.
 */

// FramedCover's lowercase friendly medium name, NOT the Prisma MediaType enum.
export type Medium = 'movies' | 'tv' | 'anime' | 'manga' | 'games'

// MediaType to FramedCover medium. TV_EPISODE folds into 'tv' (episodes reuse
// the show's clamshell chrome) even though the timeline excludes them.
export const TYPE_TO_MEDIUM: Record<MediaType, Medium> = {
  MOVIE: 'movies',
  TV_SHOW: 'tv',
  TV_EPISODE: 'tv',
  ANIME: 'anime',
  MANGA: 'manga',
  GAME: 'games',
}

// Short per-medium type label for meta lines (e.g. "MOVIE", "TV", "GAME").
export const TYPE_LABEL: Record<MediaType, string> = {
  MOVIE: 'MOVIE',
  TV_SHOW: 'TV',
  TV_EPISODE: 'EPISODE',
  ANIME: 'ANIME',
  MANGA: 'MANGA',
  GAME: 'GAME',
}

// Per-medium status labels honour the "games speak play" convention (Story 9.4
// AC-5 / Q-2): GAME relabels PLAN_TO_WATCH to PLAN TO PLAY and WATCHING to
// PLAYING. The WatchStatus enum is unchanged, this is a UI-layer relabel only.
export const STATUS_LABEL_BY_MEDIA_TYPE: Record<
  MediaType,
  Record<WatchStatus, string>
> = {
  MOVIE: {
    PLAN_TO_WATCH: 'PLAN TO WATCH',
    WATCHING: 'WATCHING',
    COMPLETED: 'COMPLETED',
    ON_HOLD: 'ON HOLD',
    DROPPED: 'DROPPED',
  },
  TV_SHOW: {
    PLAN_TO_WATCH: 'PLAN TO WATCH',
    WATCHING: 'WATCHING',
    COMPLETED: 'COMPLETED',
    ON_HOLD: 'ON HOLD',
    DROPPED: 'DROPPED',
  },
  TV_EPISODE: {
    PLAN_TO_WATCH: 'PLAN TO WATCH',
    WATCHING: 'WATCHING',
    COMPLETED: 'COMPLETED',
    ON_HOLD: 'ON HOLD',
    DROPPED: 'DROPPED',
  },
  ANIME: {
    PLAN_TO_WATCH: 'PLAN TO WATCH',
    WATCHING: 'WATCHING',
    COMPLETED: 'COMPLETED',
    ON_HOLD: 'ON HOLD',
    DROPPED: 'DROPPED',
  },
  MANGA: {
    PLAN_TO_WATCH: 'PLAN TO WATCH',
    WATCHING: 'WATCHING',
    COMPLETED: 'COMPLETED',
    ON_HOLD: 'ON HOLD',
    DROPPED: 'DROPPED',
  },
  GAME: {
    PLAN_TO_WATCH: 'PLAN TO PLAY',
    WATCHING: 'PLAYING',
    COMPLETED: 'COMPLETED',
    ON_HOLD: 'ON HOLD',
    DROPPED: 'DROPPED',
  },
}

// WatchStatus to PhosphorLED status. The single home for the mapping that the
// watch-status control, the search row, and the timeline row all need.
export const WATCH_STATUS_TO_LED: Record<WatchStatus, PhosphorLEDStatus> = {
  PLAN_TO_WATCH: 'backlog',
  WATCHING: 'in-progress',
  COMPLETED: 'completed',
  ON_HOLD: 'on-hold',
  DROPPED: 'dropped',
}
