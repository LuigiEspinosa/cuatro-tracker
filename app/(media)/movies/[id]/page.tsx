import { notFound } from 'next/navigation'
import { findUserEntryByMediaItemId } from '@/lib/db/library'
import { getMovie, getWatchProviders, getImageUrl } from '@/lib/api/tmdb'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import { BackToLibraryLink } from '@/components/molecules/BackToLibraryLink'
import { DetailHero } from '@/components/organisms/DetailHero'
import { CastList } from '@/components/organisms/CastList'
import { StreamingBadges } from '@/components/organisms/StreamingBadges'
import { SectionBand } from '@/components/organisms/SectionBand/SectionBand'
import { NotesField } from '@/components/molecules/NotesField'
import type { MetadataItem } from '@/components/molecules/MetadataRow'

export const dynamic = 'force-dynamic'

const CREW_JOBS_KEEP = new Set([
  'Director',
  'Writer',
  'Screenplay',
  'Producer',
  'Novel',
])

type PageParams = Promise<{ id: string }>

function deriveYear(releaseDate: string): number | null {
  const year = Number.parseInt(releaseDate.slice(0, 4), 10)
  if (!Number.isFinite(year) || year === 1970) return null
  return year
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

export default async function MovieDetailPage({
  params,
}: {
  params: PageParams
}) {
  const { id } = await params
  if (!id || id.length === 0) notFound()

  const entry = await findUserEntryByMediaItemId(id)
  if (!entry) notFound()
  if (entry.media_item.tmdb_id === null) {
    logger.warn(
      {
        event: 'movie_detail.missing_tmdb_id',
        mediaItemId: entry.media_item_id,
      },
      'MOVIE row has no tmdb_id; rendering 404',
    )
    notFound()
  }

  const tmdbId = entry.media_item.tmdb_id
  const [movieDetail, providers] = await Promise.all([
    getMovie(tmdbId, { withCredits: true }),
    getWatchProviders('movie', tmdbId, env.TMDB_WATCH_PROVIDER_COUNTRY),
  ])

  const cast = movieDetail.credits.cast.slice(0, 12).map((c) => ({
    name: c.name,
    role: c.character ?? '',
    profilePath: c.profile_path,
  }))

  const crew = movieDetail.credits.crew
    .filter((c) => CREW_JOBS_KEEP.has(c.job))
    .map((c) => ({
      name: c.name,
      role: c.job,
      profilePath: c.profile_path,
    }))

  const director =
    movieDetail.credits.crew.find((c) => c.job === 'Director')?.name ?? null
  const year = deriveYear(movieDetail.release_date)

  const metadata: MetadataItem[] = []
  if (movieDetail.runtime != null && movieDetail.runtime > 0) {
    metadata.push({ value: `${movieDetail.runtime} MIN` })
  }
  if (director) metadata.push({ value: director.toUpperCase() })
  if (year !== null) metadata.push({ value: String(year) })
  if (movieDetail.status && movieDetail.status.trim().length > 0) {
    metadata.push({
      value: movieDetail.status.toUpperCase(),
      dim: true,
    })
  }
  if (movieDetail.genres.length > 0) {
    metadata.push({
      value: movieDetail.genres
        .map((g) => g.name.toUpperCase())
        .join(' · '),
      dim: true,
    })
  }

  const posterUrl = getImageUrl(entry.media_item.poster_path, 'w780')

  const synopsisParagraphs = (movieDetail.overview ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  return (
    <main className='movie-detail-page'>
      <BackToLibraryLink medium='movies' />
      <DetailHero
        mediaItemId={entry.media_item_id}
        medium='movies'
        mediumLabel={`MOVIE${year !== null ? ` · ${year}` : ''}`}
        title={movieDetail.title}
        originalTitle={movieDetail.original_title ?? null}
        posterUrl={posterUrl}
        metadata={metadata}
        currentStatus={entry.status}
        userRating={entry.user_rating}
        showQbtButton
      />
      <div className='movie-detail-rule' aria-hidden='true' />
      {synopsisParagraphs.length > 0 ? (
        <article className='movie-detail-synopsis'>
          {synopsisParagraphs.map((para, idx) => (
            <p key={idx}>{para}</p>
          ))}
        </article>
      ) : null}
      <NotesField
        mediaItemId={entry.media_item_id}
        initialNotes={entry.notes ?? ''}
      />
      <div className='movie-detail-rule movie-detail-rule-thick' aria-hidden='true' />
      <SectionBand title='Cast' count={cast.length}>
        <CastList people={cast} />
      </SectionBand>
      {crew.length > 0 ? (
        <SectionBand title='Crew' count={crew.length}>
          <CastList people={crew} />
        </SectionBand>
      ) : null}
      <SectionBand title='Streaming'>
        <StreamingBadges providers={providers} />
      </SectionBand>
      <SectionBand title='Related'>
        <p className='movie-detail-placeholder'>
          Franchise relations ship in Phase 10.
        </p>
      </SectionBand>
    </main>
  )
}
