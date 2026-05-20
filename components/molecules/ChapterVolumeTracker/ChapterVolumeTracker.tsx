'use client'

import { PhosphorBar } from '@/components/atoms/PhosphorBar'
import { CHAPTERS_PER_VOLUME } from '@/lib/constants/manga'

export type ChapterVolumeTrackerProps = {
  chapterCount: number | null
  volumeCount: number | null
  progress: number
  volumeProgress: number
  lifecycleStatus: string | null
  onUpdate: (next: { progress: number; volumeProgress: number }) => void
  disabled?: boolean
}

export function ChapterVolumeTracker({
  chapterCount,
  volumeCount,
  progress,
  volumeProgress,
  lifecycleStatus,
  onUpdate,
  disabled = false,
}: ChapterVolumeTrackerProps) {
  const hasVolumeAxis = volumeCount !== null && volumeCount > 0
  const isOngoing = lifecycleStatus === 'RELEASING' || lifecycleStatus === 'releasing'
  const chapterMax =
    chapterCount !== null && chapterCount > 0
      ? chapterCount
      : Math.max(progress + 1, 1)
  const volumeMax =
    hasVolumeAxis && volumeCount !== null && volumeCount > 0 ? volumeCount : 0

  const nextVolumeNumber = volumeProgress + 1
  const canMarkNextVolume =
    hasVolumeAxis &&
    volumeCount !== null &&
    nextVolumeNumber <= volumeCount

  function decrementChapter() {
    if (progress <= 0) return
    onUpdate({ progress: progress - 1, volumeProgress })
  }

  function incrementChapter() {
    onUpdate({ progress: progress + 1, volumeProgress })
  }

  function decrementVolume() {
    if (volumeProgress <= 0) return
    onUpdate({ progress, volumeProgress: volumeProgress - 1 })
  }

  function incrementVolume() {
    if (volumeCount !== null && volumeProgress >= volumeCount) return
    onUpdate({ progress, volumeProgress: volumeProgress + 1 })
  }

  function markVolumeComplete() {
    if (!canMarkNextVolume) return
    onUpdate({
      progress: nextVolumeNumber * CHAPTERS_PER_VOLUME,
      volumeProgress: nextVolumeNumber,
    })
  }

  return (
    <div className='chapter-volume-tracker'>
      <section className='chapter-volume-tracker-row chapter-volume-tracker-row-chapters'>
        <p className='chapter-volume-tracker-label'>
          <span>
            {progress} / {chapterCount ?? '?'} CHAPTERS
          </span>
          {isOngoing ? (
            <span
              className='chapter-volume-tracker-ongoing'
              aria-label='Status: ongoing'
            >
              ONGOING
            </span>
          ) : null}
        </p>
        <PhosphorBar
          value={progress}
          max={chapterMax}
          label='Chapter progress'
        />
        <div className='chapter-volume-tracker-controls'>
          <button
            type='button'
            className='cpb chapter-volume-tracker-button'
            onClick={decrementChapter}
            disabled={disabled || progress <= 0}
            aria-label='Decrement chapter progress by one'
          >
            -1
          </button>
          <button
            type='button'
            className='cpb chapter-volume-tracker-button'
            onClick={incrementChapter}
            disabled={disabled}
            aria-label='Increment chapter progress by one'
          >
            +1
          </button>
          {canMarkNextVolume ? (
            <button
              type='button'
              className='cpb chapter-volume-tracker-button chapter-volume-tracker-button-mark'
              onClick={markVolumeComplete}
              disabled={disabled}
              aria-label={`Mark volume ${nextVolumeNumber} complete`}
            >
              MARK VOLUME {nextVolumeNumber} COMPLETE
            </button>
          ) : null}
        </div>
      </section>
      {hasVolumeAxis ? (
        <section className='chapter-volume-tracker-row chapter-volume-tracker-row-volumes'>
          <p className='chapter-volume-tracker-label'>
            {volumeProgress} / {volumeCount} VOLUMES
          </p>
          <PhosphorBar
            value={volumeProgress}
            max={volumeMax}
            label='Volume progress'
          />
          <div className='chapter-volume-tracker-controls'>
            <button
              type='button'
              className='cpb chapter-volume-tracker-button'
              onClick={decrementVolume}
              disabled={disabled || volumeProgress <= 0}
              aria-label='Decrement volume progress by one'
            >
              -1
            </button>
            <button
              type='button'
              className='cpb chapter-volume-tracker-button'
              onClick={incrementVolume}
              disabled={
                disabled || (volumeCount !== null && volumeProgress >= volumeCount)
              }
              aria-label='Increment volume progress by one'
            >
              +1
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}
