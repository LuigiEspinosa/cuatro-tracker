'use client'

import { useEffect, useState } from 'react'
import { WatchStatus } from '@prisma/client'
import { PhosphorBar } from '@/components/atoms/PhosphorBar'
import { EpisodeWatchToggle } from '@/components/molecules/EpisodeWatchToggle'

export type SeasonEpisode = {
  mediaItemId: string
  seasonNumber: number
  episodeNumber: number
  title: string
  airDate: string | null
  runtime: number | null
  unaired: boolean
  status: WatchStatus | null
}

export type SeasonGroup = {
  number: number
  episodes: SeasonEpisode[]
}

export type SeasonAccordionProps = {
  seasons: SeasonGroup[]
  defaultExpandedSeason: number | null
  onToggleEpisode: (mediaItemId: string, next: WatchStatus) => void
  onMarkSeasonWatched: (seasonNumber: number) => void
}

function seasonLabel(number: number): string {
  return number === 0 ? 'SPECIALS' : `SEASON ${number}`
}

function watchedCount(episodes: SeasonEpisode[]): number {
  return episodes.filter((e) => e.status === WatchStatus.COMPLETED).length
}

function airedCount(episodes: SeasonEpisode[]): number {
  return episodes.filter((e) => !e.unaired).length
}

function formatAirDate(raw: string | null, unaired: boolean): string {
  if (unaired) return 'UNAIRED'
  if (!raw) return '—'
  // Server passes ISO; format as YYYY-MM-DD.
  return raw.slice(0, 10)
}

export function SeasonAccordion({
  seasons,
  defaultExpandedSeason,
  onToggleEpisode,
  onMarkSeasonWatched,
}: SeasonAccordionProps) {
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(defaultExpandedSeason === null ? [] : [defaultExpandedSeason]),
  )

  // When the server re-renders after a mutation (router.refresh()), the
  // `defaultExpandedSeason` prop can change (e.g. user just watched the last
  // S1 episode → new default is S2). Additively expand the new default so the
  // user's manual expansions are preserved.
  useEffect(() => {
    if (defaultExpandedSeason === null) return
    setExpanded((prev) => {
      if (prev.has(defaultExpandedSeason)) return prev
      const next = new Set(prev)
      next.add(defaultExpandedSeason)
      return next
    })
  }, [defaultExpandedSeason])

  return (
    <div className='season-accordion'>
      {seasons.map((season) => {
        const isOpen = expanded.has(season.number)
        const total = airedCount(season.episodes)
        const watched = watchedCount(season.episodes)
        return (
          <section
            key={season.number}
            id={`season-${season.number}`}
            className='season-accordion-section'
            data-expanded={isOpen ? 'true' : 'false'}
          >
            <button
              type='button'
              className='season-accordion-header'
              aria-expanded={isOpen}
              aria-controls={`season-${season.number}-panel`}
              onClick={() => {
                setExpanded((prev) => {
                  const next = new Set(prev)
                  if (next.has(season.number)) next.delete(season.number)
                  else next.add(season.number)
                  return next
                })
              }}
            >
              <span className='season-accordion-header-title'>
                {seasonLabel(season.number)}
              </span>
              <span className='season-accordion-header-count'>
                {season.episodes.length} EPISODES
              </span>
              <span className='season-accordion-header-progress'>
                <PhosphorBar
                  value={watched}
                  max={total > 0 ? total : 1}
                  label={`${seasonLabel(season.number)} progress`}
                />
              </span>
              <span
                className='season-accordion-header-chev'
                aria-hidden='true'
                data-rot={isOpen ? '90' : '0'}
              >
                ›
              </span>
            </button>
            {isOpen ? (
              <div
                id={`season-${season.number}-panel`}
                className='season-accordion-panel'
              >
                <div className='season-accordion-actions'>
                  <button
                    type='button'
                    className='season-accordion-mark-watched crt-pixel-button'
                    disabled={total === 0}
                    onClick={() => onMarkSeasonWatched(season.number)}
                  >
                    &gt; MARK SEASON WATCHED
                  </button>
                </div>
                <ul className='season-accordion-episodes'>
                  {season.episodes.map((episode) => {
                    const isWatched = episode.status === WatchStatus.COMPLETED
                    return (
                      <li
                        key={episode.mediaItemId}
                        className='season-accordion-episode'
                        data-unaired={episode.unaired ? 'true' : 'false'}
                      >
                        <span className='season-accordion-episode-code'>
                          S{episode.seasonNumber}E{episode.episodeNumber}
                        </span>
                        <span className='season-accordion-episode-title'>
                          {episode.title}
                        </span>
                        <span className='season-accordion-episode-air'>
                          {formatAirDate(episode.airDate, episode.unaired)}
                        </span>
                        <span className='season-accordion-episode-runtime'>
                          {episode.runtime ? `${episode.runtime} MIN` : ''}
                        </span>
                        <EpisodeWatchToggle
                          checked={isWatched}
                          disabled={episode.unaired}
                          label={`Mark ${episode.title} watched`}
                          onToggle={() =>
                            onToggleEpisode(
                              episode.mediaItemId,
                              isWatched
                                ? WatchStatus.PLAN_TO_WATCH
                                : WatchStatus.COMPLETED,
                            )
                          }
                        />
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
