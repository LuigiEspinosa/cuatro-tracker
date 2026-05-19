'use client'

import { EpisodeWatchToggle } from '@/components/molecules/EpisodeWatchToggle'

export type EpisodeChecklistProps = {
  mediaItemId: string
  episodeCount: number
  progress: number
  onToggleEpisode: (episodeNumber: number, nextChecked: boolean) => void
}

export function EpisodeChecklist({
  mediaItemId,
  episodeCount,
  progress,
  onToggleEpisode,
}: EpisodeChecklistProps) {
  if (episodeCount <= 0) return null

  const rows = Array.from({ length: episodeCount }, (_, idx) => idx + 1)

  return (
    <ul
      className='episode-checklist'
      data-media-item-id={mediaItemId}
      aria-label='Episode checklist'
    >
      {rows.map((n) => {
        const isWatched = n <= progress
        return (
          <li
            key={n}
            className='episode-checklist-row'
            data-checked={isWatched ? 'true' : 'false'}
          >
            <span className='episode-checklist-row-code'>EP {n}</span>
            <span className='episode-checklist-row-meta' aria-hidden='true' />
            <EpisodeWatchToggle
              checked={isWatched}
              label={`Mark episode ${n} watched`}
              onToggle={() => onToggleEpisode(n, !isWatched)}
            />
          </li>
        )
      })}
    </ul>
  )
}
