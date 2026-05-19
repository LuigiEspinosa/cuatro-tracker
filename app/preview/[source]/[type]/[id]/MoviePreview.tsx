import Link from 'next/link'
import { MediaType } from '@prisma/client'
import { getMovie, getWatchProviders, getImageUrl } from '@/lib/api/tmdb'
import { env } from '@/lib/env'
import { DetailHero } from '@/components/organisms/DetailHero'
import { CastList } from '@/components/organisms/CastList'
import { StreamingBadges } from '@/components/organisms/StreamingBadges'
import { SectionBand } from '@/components/organisms/SectionBand/SectionBand'
import type { MetadataItem } from '@/components/molecules/MetadataRow'
import { AddToLibraryButton } from './AddToLibraryButton'

const CREW_JOBS_KEEP = new Set([
  'Director',
  'Writer',
  'Screenplay',
  'Producer',
  'Novel',
])

function deriveYear(releaseDate: string): number | null {
  const year = Number.parseInt(releaseDate.slice(0, 4), 10)
  if (!Number.isFinite(year) || year === 1970) return null
  return year
}

export async function MoviePreview({ id }: { id: number }) {
  const [movieDetail, providers] = await Promise.all([
    getMovie(id, { withCredits: true }),
    getWatchProviders('movie', id, env.TMDB_WATCH_PROVIDER_COUNTRY),
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
    metadata.push({ value: movieDetail.status.toUpperCase(), dim: true })
  }
  if (movieDetail.genres.length > 0) {
    metadata.push({
      value: movieDetail.genres.map((g) => g.name.toUpperCase()).join(' · '),
      dim: true,
    })
  }

  const posterUrl = getImageUrl(movieDetail.poster_path, 'w780')

  const synopsisParagraphs = (movieDetail.overview ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  return (
    <main className='movie-detail-page'>
      <Link href='/search' className='back-to-library-link'>
        <span className='back-to-library-link-arrow' aria-hidden='true'>
          &lt;
        </span>{' '}
        BACK TO SEARCH
      </Link>
      <DetailHero
        medium='movies'
        mediumLabel={`MOVIE${year !== null ? ` · ${year}` : ''} · PREVIEW`}
        title={movieDetail.title}
        originalTitle={movieDetail.original_title ?? null}
        posterUrl={posterUrl}
        metadata={metadata}
        imdbId={movieDetail.external_ids?.imdb_id ?? null}
        showQbtButton={false}
        actionsOverride={
          <AddToLibraryButton
            source='tmdb'
            sourceId={id}
            type={MediaType.MOVIE}
            medium='movies'
          />
        }
      />
      <div className='movie-detail-rule' aria-hidden='true' />
      {synopsisParagraphs.length > 0 ? (
        <article className='movie-detail-synopsis'>
          {synopsisParagraphs.map((para, idx) => (
            <p key={idx}>{para}</p>
          ))}
        </article>
      ) : null}
      <div
        className='movie-detail-rule movie-detail-rule-thick'
        aria-hidden='true'
      />
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
    </main>
  )
}
