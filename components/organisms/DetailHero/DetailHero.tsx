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
  mediaItemId: string
  medium: 'movies' | 'tv' | 'anime' | 'manga' | 'games'
  mediumLabel: string
  title: string
  originalTitle: string | null
  posterUrl: string | null
  metadata: MetadataItem[]
  currentStatus: WatchStatus
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
  imdbId,
  showQbtButton,
}: DetailHeroProps) {
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
          <WatchStatusControl
            mediaItemId={mediaItemId}
            currentStatus={currentStatus}
          />
          <div className='detail-hero-action-buttons'>
            {showQbtButton ? <SendToQbtButton /> : null}
            <WatchOnImdbButton imdbId={imdbId} />
          </div>
        </div>
      </div>
    </section>
  )
}
