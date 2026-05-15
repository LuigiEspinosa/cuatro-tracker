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
}

const TYPE_LABEL: Record<MediaType, string> = {
  MOVIE: 'MOVIE',
  TV_SHOW: 'TV',
  TV_EPISODE: 'EPISODE',
  ANIME: 'ANIME',
  MANGA: 'MANGA',
  GAME: 'GAME',
}

const STATUS_LABEL: Record<WatchStatus, string> = {
  PLAN_TO_WATCH: 'PLAN TO WATCH',
  WATCHING: 'WATCHING',
  COMPLETED: 'COMPLETED',
  ON_HOLD: 'ON HOLD',
  DROPPED: 'DROPPED',
}

export function MediaCardOverlay({
  title,
  year,
  mediaType,
  status,
  progressLabel = null,
  progressPct = null,
}: MediaCardOverlayProps) {
  const typeLabel = TYPE_LABEL[mediaType]
  const yearLabel = year === null ? typeLabel : `${typeLabel} · ${year}`
  const showProgress =
    progressLabel !== null &&
    progressLabel.length > 0 &&
    progressPct !== null &&
    Number.isFinite(progressPct)
  return (
    <div className='media-card-overlay' aria-hidden='true'>
      <h3 className='media-card-overlay-title'>{title}</h3>
      <p className='media-card-overlay-meta'>{yearLabel}</p>
      <p
        className='media-card-overlay-status'
        data-status={status.toLowerCase()}
      >
        {STATUS_LABEL[status]}
      </p>
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
