import { notFound } from 'next/navigation'
import { MediaType, WatchStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { findUserEntryByMediaItemId } from '@/lib/db/library'
import { getTv, getWatchProviders, getImageUrl } from '@/lib/api/tmdb'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { BackToLibraryLink } from '@/components/molecules/BackToLibraryLink'
import { DetailHero } from '@/components/organisms/DetailHero'
import { CastList } from '@/components/organisms/CastList'
import { StreamingBadges } from '@/components/organisms/StreamingBadges'
import { SectionBand } from '@/components/organisms/SectionBand/SectionBand'
import { PhosphorBar } from '@/components/atoms/PhosphorBar'
import type { MetadataItem } from '@/components/molecules/MetadataRow'
import type { SeasonEpisode, SeasonGroup } from '@/components/molecules/SeasonAccordion'
import { TvDetailControls } from './TvDetailControls'

export const dynamic = 'force-dynamic'

type PageParams = Promise<{ id: string }>

function deriveYear(d: Date): number | null {
  const y = d.getUTCFullYear()
  return y === 1970 ? null : y
}

function computeDefaultExpandedSeason(
  seasons: SeasonGroup[],
): number | null {
  if (seasons.length === 0) return null
  // Find the highest season where the user has at least one watched episode;
  // expand the NEXT season after that (the user's "currently watching"
  // position). Fall back to the lowest season number if nothing watched yet.
  let highestWatchedSeason = -1
  for (const season of seasons) {
    const hasWatched = season.episodes.some(
      (e) => e.status === WatchStatus.COMPLETED,
    )
    if (hasWatched && season.number > highestWatchedSeason) {
      highestWatchedSeason = season.number
    }
  }
  if (highestWatchedSeason === -1) return seasons[0].number
  const seasonNumbers = seasons.map((s) => s.number).sort((a, b) => a - b)
  const idx = seasonNumbers.indexOf(highestWatchedSeason)
  // Next season exists → expand it. Otherwise stay on the last watched one.
  if (idx >= 0 && idx + 1 < seasonNumbers.length) return seasonNumbers[idx + 1]
  return highestWatchedSeason
}

export async function generateMetadata({
  params,
}: {
  params: PageParams
}): Promise<{ title: string }> {
  const { id } = await params
  const entry = await findUserEntryByMediaItemId(id)
  if (!entry) return { title: 'NOT IN LIBRARY · Cuatro Tracker' }
  return {
    title: `${entry.media_item.title.toUpperCase()} · Cuatro Tracker`,
  }
}

export default async function TvDetailPage({
  params,
}: {
  params: PageParams
}) {
  const { id } = await params
  if (!id) notFound()

  const entry = await findUserEntryByMediaItemId(id)
  if (!entry || entry.media_item.type !== MediaType.TV_SHOW) notFound()
  if (entry.media_item.tmdb_id === null) {
    logger.warn(
      { event: 'tv_detail.missing_tmdb_id', mediaItemId: id },
      'TV_SHOW row has no tmdb_id; rendering 404',
    )
    notFound()
  }

  const tmdbId = entry.media_item.tmdb_id

  // Parallel-fetch the show's episodes (with UserEntry join) + TMDB detail +
  // watch providers. The show MediaItem + its UserEntry came from
  // findUserEntryByMediaItemId above.
  const [episodes, tvDetail, providers] = await Promise.all([
    db.mediaItem.findMany({
      where: { parent_id: id, type: MediaType.TV_EPISODE },
      orderBy: [{ season_number: 'asc' }, { episode_number: 'asc' }],
      include: { user_entry: true },
    }),
    getTv(tmdbId),
    getWatchProviders('tv', tmdbId, env.TMDB_WATCH_PROVIDER_COUNTRY),
  ])

  // Group episodes by season_number.
  const seasonsMap = new Map<number, SeasonEpisode[]>()
  for (const ep of episodes) {
    const sNum = ep.season_number ?? 0
    const list = seasonsMap.get(sNum) ?? []
    list.push({
      mediaItemId: ep.id,
      seasonNumber: sNum,
      episodeNumber: ep.episode_number ?? 0,
      title: ep.title,
      airDate: ep.release_date
        ? ep.release_date.getUTCFullYear() === 1970
          ? null
          : ep.release_date.toISOString()
        : null,
      runtime: ep.runtime,
      unaired: ep.unaired,
      status: ep.user_entry?.status ?? null,
    })
    seasonsMap.set(sNum, list)
  }
  const seasons: SeasonGroup[] = Array.from(seasonsMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([number, eps]) => ({ number, episodes: eps }))

  // Show-level PhosphorBar metrics.
  const totalAired = episodes.filter((e) => !e.unaired).length
  const watched = episodes.filter(
    (e) => e.user_entry?.status === WatchStatus.COMPLETED && !e.unaired,
  ).length

  const defaultExpandedSeason = computeDefaultExpandedSeason(seasons)

  // Hero metadata.
  const year = deriveYear(entry.media_item.release_date)
  const cast = tvDetail.credits.cast.slice(0, 12).map((c) => ({
    name: c.name,
    role: c.character ?? '',
    profilePath: c.profile_path,
  }))

  const metadata: MetadataItem[] = []
  if (totalAired > 0) {
    metadata.push({ value: `${totalAired} EPISODES` })
  }
  if (year !== null) metadata.push({ value: String(year) })
  if (entry.media_item.lifecycle_status) {
    metadata.push({
      value: entry.media_item.lifecycle_status.replaceAll('_', ' ').toUpperCase(),
      dim: true,
    })
  }
  if (entry.media_item.genres.length > 0) {
    metadata.push({
      value: entry.media_item.genres.map((g) => g.toUpperCase()).join(' · '),
      dim: true,
    })
  }

  const posterUrl = getImageUrl(entry.media_item.poster_path, 'w780')

  const synopsisParagraphs = (entry.media_item.overview ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  return (
    <main className='tv-detail-page'>
      <BackToLibraryLink medium='tv' />
      <DetailHero
        mediaItemId={entry.media_item_id}
        medium='tv'
        mediumLabel={`TV${year !== null ? ` · ${year}` : ''}`}
        title={entry.media_item.title}
        originalTitle={entry.media_item.original_title}
        posterUrl={posterUrl}
        metadata={metadata}
        currentStatus={entry.status}
        imdbId={tvDetail.external_ids?.imdb_id ?? null}
        showQbtButton={false}
      />
      <div className='tv-detail-rule' aria-hidden='true' />
      {synopsisParagraphs.length > 0 ? (
        <article className='tv-detail-synopsis'>
          {synopsisParagraphs.map((para, idx) => (
            <p key={idx}>{para}</p>
          ))}
        </article>
      ) : null}
      <div className='tv-detail-rule tv-detail-rule-thick' aria-hidden='true' />
      <section className='tv-detail-progress' aria-label='Show progress'>
        <p className='tv-detail-progress-label'>
          {watched} / {totalAired} EPISODES WATCHED
        </p>
        <PhosphorBar
          value={watched}
          max={totalAired > 0 ? totalAired : 1}
          label='Show progress'
        />
      </section>
      <SectionBand title='Seasons' count={seasons.length}>
        <TvDetailControls
          showId={entry.media_item_id}
          seasons={seasons}
          defaultExpandedSeason={defaultExpandedSeason}
        />
      </SectionBand>
      <SectionBand title='Cast' count={cast.length}>
        <CastList people={cast} />
      </SectionBand>
      <SectionBand title='Streaming'>
        <StreamingBadges providers={providers} />
      </SectionBand>
    </main>
  )
}
