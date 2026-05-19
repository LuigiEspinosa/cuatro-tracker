'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { MediaType } from '@prisma/client'
import { CRTBezel } from '@/components/molecules/CRTBezel'
import { EmptyStateCard } from '@/components/molecules/EmptyStateCard'
import { FramedCover } from '@/components/molecules/FramedCover'
import type { Medium } from '@/components/molecules/FramedCover/media-registry'
import { useChannelFlipNavigate } from '@/components/molecules/ChannelFlipTransition'
import { getImageUrl } from '@/lib/api/tmdb-images'
import { detailRouteFor } from '@/lib/detail-route'
import type { LibraryItem } from '@/lib/types/library'

export type CurrentlyActiveCarouselProps = {
  items: LibraryItem[]
  rotationMs?: number
}

const DEFAULT_ROTATION_MS = 5000

const MEDIA_TYPE_TO_MEDIUM: Record<MediaType, Medium> = {
  MOVIE: 'movies',
  TV_SHOW: 'tv',
  TV_EPISODE: 'tv',
  ANIME: 'anime',
  MANGA: 'manga',
  GAME: 'games',
}

const MEDIA_TYPE_LABEL: Record<MediaType, string> = {
  MOVIE: 'MOVIE',
  TV_SHOW: 'TV',
  TV_EPISODE: 'TV',
  ANIME: 'ANIME',
  MANGA: 'MANGA',
  GAME: 'GAME',
}


function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

export function CurrentlyActiveCarousel({
  items,
  rotationMs = DEFAULT_ROTATION_MS,
}: CurrentlyActiveCarouselProps) {
  const { navigate } = useChannelFlipNavigate()
  const [activeIdx, setActiveIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const reducedMotion = usePrefersReducedMotion()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const advance = useCallback(
    (direction: 1 | -1) => {
      if (items.length === 0) return
      setActiveIdx((prev) => (prev + direction + items.length) % items.length)
    },
    [items.length],
  )

  // Auto-cycle effect: advance every rotationMs unless paused or reduced-motion.
  useEffect(() => {
    if (items.length < 2 || paused || reducedMotion) return undefined
    timerRef.current = setTimeout(() => {
      setActiveIdx((prev) => (prev + 1) % items.length)
    }, rotationMs)
    return clearTimer
  }, [activeIdx, items.length, paused, reducedMotion, rotationMs, clearTimer])

  // Empty state. Migrated from app/page.tsx inline render (Story 5.2 → 5.3).
  if (items.length === 0) {
    return (
      <div className='dash-hero' aria-label='Currently active'>
        <CRTBezel size='hero' className='dash-hero-bezel'>
          <div className='dash-hero-screen'>
            <EmptyStateCard
              variant='hero'
              headline='LIBRARY EMPTY'
              secondLine='ADD AN ITEM TO BEGIN'
              subtitle='Search any title across TMDB, AniList, IGDB or Steam to start your collection.'
              ctaLabel='ADD'
              onCta={() => {
                void navigate('/search')
              }}
            />
          </div>
        </CRTBezel>
      </div>
    )
  }

  const active = items[activeIdx % items.length]
  const medium = MEDIA_TYPE_TO_MEDIUM[active.mediaType]
  const posterUrl =
    getImageUrl(active.posterPath, 'w342') ??
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
  const detailRoute = detailRouteFor(active)

  return (
    <section className='dash-hero cac' aria-label='Currently active'>
      <CRTBezel size='hero' className='dash-hero-bezel'>
        <div
          className='dash-hero-screen cac-screen'
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(event) => {
            // Only resume if focus left the screen entirely.
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setPaused(false)
            }
          }}
        >
          {detailRoute !== null ? (
            <Link
              href={detailRoute}
              className='cac-screen-link'
              aria-label={`Open ${active.title} detail`}
            />
          ) : null}
          <div className='cac-cover'>
            <FramedCover
              medium={medium}
              size='hero-cover'
              src={posterUrl}
              alt={active.title}
            />
          </div>
          <div className='cac-info'>
            <p className='cac-eyebrow'>
              {MEDIA_TYPE_LABEL[active.mediaType]} · NOW WATCHING
            </p>
            <h2 className='cac-title'>{active.title}</h2>
            <p className='cac-meta'>
              {active.progressLabel ?? '—'}
              {active.year !== null ? (
                <>
                  <span className='cac-meta-sep' aria-hidden='true'>·</span>
                  <span>{active.year}</span>
                </>
              ) : null}
            </p>
            {active.progressPct !== null ? (
              <div
                className='cac-progress'
                aria-label={`Progress: ${active.progressPct}%`}
                role='progressbar'
                aria-valuenow={active.progressPct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className='cac-progress-fill'
                  style={{ width: `${active.progressPct}%` }}
                />
              </div>
            ) : null}
            {active.sourceLabel !== null ? (
              <p className='cac-source'>{active.sourceLabel}</p>
            ) : null}
          </div>
        </div>
      </CRTBezel>
      <div
        className='cac-dot-row'
        role='tablist'
        aria-label='Currently active items'
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            advance(1)
          } else if (event.key === 'ArrowLeft') {
            event.preventDefault()
            advance(-1)
          }
        }}
      >
        {items.map((item, i) => (
          <button
            key={item.id}
            type='button'
            role='tab'
            aria-selected={i === activeIdx}
            aria-label={`Show item ${i + 1} of ${items.length}: ${item.title}`}
            className={['cac-dot', i === activeIdx ? 'cac-dot-active' : ''].filter(Boolean).join(' ')}
            onClick={() => setActiveIdx(i)}
            onPointerEnter={() => setPaused(true)}
            onPointerLeave={() => setPaused(false)}
          />
        ))}
      </div>
    </section>
  )
}
