'use client'

import { MediaType, WatchStatus } from '@prisma/client'
import { PhosphorBar } from '@/components/atoms/PhosphorBar'

export type MediaCardOverlayProps = {
  title: string
  year: number | null
  mediaType: MediaType
  status: WatchStatus
  progressLabel?: string | null
  progressPct?: number | null
  // GAME-only signal sourced from MediaItem.achievement_sync_status (Story 9.2
  // schema; default 'never_synced'). Typed as plain string so future
  // CHECK-constraint additions don't force a coordinated client release.
  achievementSyncStatus?: string | null
}

const TYPE_LABEL: Record<MediaType, string> = {
  MOVIE: 'MOVIE',
  TV_SHOW: 'TV',
  TV_EPISODE: 'EPISODE',
  ANIME: 'ANIME',
  MANGA: 'MANGA',
  GAME: 'GAME',
}

// Per-medium status labels honour the "games speak play" convention (Story
// 9.4 AC-5 / Q-2). The WatchStatus enum stays intact - this is a UI-layer
// relabel only.
const STATUS_LABEL_BY_MEDIA_TYPE: Record<MediaType, Record<WatchStatus, string>> = {
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

export function MediaCardOverlay({
  title,
  year,
  mediaType,
  status,
  progressLabel = null,
  progressPct = null,
  achievementSyncStatus = null,
}: MediaCardOverlayProps) {
  const typeLabel = TYPE_LABEL[mediaType]
  const yearLabel = year === null ? typeLabel : `${typeLabel} · ${year}`
  const showProgress =
    progressLabel !== null &&
    progressLabel.length > 0 &&
    progressPct !== null &&
    Number.isFinite(progressPct)
  // Doubled gate: render the chip only when both the type and the status
  // match. The serializer should never produce a non-null
  // achievementSyncStatus on non-GAME rows, but the explicit check guards
  // against a future regression.
  const showPrivateChip =
    mediaType === MediaType.GAME && achievementSyncStatus === 'private_profile'
  return (
    <div className='media-card-overlay' aria-hidden='true'>
      <h3 className='media-card-overlay-title'>{title}</h3>
      <p className='media-card-overlay-meta'>{yearLabel}</p>
      <p
        className='media-card-overlay-status'
        data-status={status.toLowerCase()}
      >
        {STATUS_LABEL_BY_MEDIA_TYPE[mediaType][status]}
      </p>
      {showPrivateChip ? (
        <p
          className='media-card-overlay-private-chip'
          data-achievement-sync-status='private_profile'
        >
          PRIVATE PROFILE
        </p>
      ) : null}
      {showProgress ? (
        <div className='media-card-overlay-progress'>
          <p className='media-card-overlay-progress-label'>{progressLabel}</p>
          <PhosphorBar
            value={progressPct as number}
            max={100}
            label={progressLabel as string}
          />
        </div>
      ) : null}
    </div>
  )
}
