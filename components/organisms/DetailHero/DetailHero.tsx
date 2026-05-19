import type { ReactNode } from 'react'
import type { WatchStatus } from '@prisma/client'
import { FramedCover } from '@/components/molecules/FramedCover/FramedCover'
import { BitmapText } from '@/components/atoms/BitmapText/BitmapText'
import {
  MetadataRow,
  type MetadataItem,
} from '@/components/molecules/MetadataRow'
import { WatchStatusControl } from '@/components/molecules/WatchStatusControl'
import { SendToQbtButton } from '@/components/molecules/SendToQbtButton'
import { WatchOnImdbButton } from '@/components/molecules/WatchOnImdbButton'

export type DetailHeroProps = {
  // Library-state props. Both optional so preview pages (which have no
  // MediaItem row yet) can render the same hero shell with an
  // `actionsOverride` slot instead.
  mediaItemId?: string
  currentStatus?: WatchStatus
  // When provided, replaces the default WatchStatusControl in the actions
  // row. Used by /preview/... to render an ADD TO LIBRARY button.
  actionsOverride?: ReactNode
  medium: 'movies' | 'tv' | 'anime' | 'manga' | 'games'
  mediumLabel: string
  title: string
  originalTitle: string | null
  posterUrl: string | null
  metadata: MetadataItem[]
  imdbId: string | null
  showQbtButton: boolean
}

export function DetailHero({
  mediaItemId,
  medium,
  mediumLabel,
  title,
  originalTitle,
  posterUrl,
  metadata,
  currentStatus,
  actionsOverride,
  imdbId,
  showQbtButton,
}: DetailHeroProps) {
  // Preview pages pass actionsOverride; detail pages pass currentStatus +
  // mediaItemId. Both shapes converge on the same hero layout below.
  const primaryAction =
    actionsOverride ??
    (mediaItemId !== undefined && currentStatus !== undefined ? (
      <WatchStatusControl
        mediaItemId={mediaItemId}
        currentStatus={currentStatus}
      />
    ) : null)

  return (
    <section className='detail-hero' aria-label='Item header'>
      <div className='detail-hero-cover'>
        <FramedCover
          medium={medium}
          size='hero'
          src={posterUrl ?? '/placeholder-cover.png'}
          alt={title}
        />
      </div>
      <div className='detail-hero-text'>
        <BitmapText size={11} tone='cream-dim' className='detail-hero-medium'>
          {mediumLabel}
        </BitmapText>
        <h1 className='detail-hero-title'>{title}</h1>
        {originalTitle && originalTitle !== title ? (
          <p className='detail-hero-original-title'>{originalTitle}</p>
        ) : null}
        <MetadataRow items={metadata} />
        <div className='detail-hero-actions'>
          {primaryAction}
          <div className='detail-hero-action-buttons'>
            {showQbtButton ? <SendToQbtButton /> : null}
            <WatchOnImdbButton imdbId={imdbId} />
          </div>
        </div>
      </div>
    </section>
  )
}
