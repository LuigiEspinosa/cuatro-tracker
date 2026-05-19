import Link from 'next/link'
import { MediaType } from '@prisma/client'
import { getTv, getImageUrl } from '@/lib/api/tmdb'
import { DetailHero } from '@/components/organisms/DetailHero'
import { CastList } from '@/components/organisms/CastList'
import { StreamingBadges } from '@/components/organisms/StreamingBadges'
import { SectionBand } from '@/components/organisms/SectionBand/SectionBand'
import type { MetadataItem } from '@/components/molecules/MetadataRow'
import type { TmdbCountryProviders } from '@/lib/api/tmdb'
import { env } from '@/lib/env'
import { AddToLibraryButton } from './AddToLibraryButton'

function deriveYear(firstAirDate: string): number | null {
  const year = Number.parseInt(firstAirDate.slice(0, 4), 10)
  if (!Number.isFinite(year) || year === 1970) return null
  return year
}

const EMPTY_PROVIDERS: TmdbCountryProviders = {
  link: '',
  flatrate: [],
  buy: [],
  rent: [],
}

export async function TvPreview({ id }: { id: number }) {
  const tv = await getTv(id)

  const cast = tv.credits.cast.slice(0, 12).map((c) => ({
    name: c.name,
    role: c.character ?? '',
    profilePath: c.profile_path,
  }))

  const year = deriveYear(tv.first_air_date)
  const totalSeasons = tv.number_of_seasons ?? null
  const totalEpisodes = tv.number_of_episodes ?? null

  const metadata: MetadataItem[] = []
  if (totalEpisodes !== null && totalEpisodes > 0) {
    metadata.push({ value: `${totalEpisodes} EPISODES` })
  }
  if (totalSeasons !== null && totalSeasons > 0) {
    metadata.push({ value: `${totalSeasons} SEASONS` })
  }
  if (year !== null) metadata.push({ value: String(year) })
  if (tv.status && tv.status.trim().length > 0) {
    metadata.push({ value: tv.status.toUpperCase(), dim: true })
  }
  if (tv.genres.length > 0) {
    metadata.push({
      value: tv.genres.map((g) => g.name.toUpperCase()).join(' · '),
      dim: true,
    })
  }

  const posterUrl = getImageUrl(tv.poster_path, 'w780')

  const synopsisParagraphs = (tv.overview ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  // getTv() appends watch/providers but we resolve the country slice locally
  // (the helper getWatchProviders() does the same shape extraction). Empty
  // slice when the country isn't represented in the response.
  const country = env.TMDB_WATCH_PROVIDER_COUNTRY
  const providersSlice = tv['watch/providers']?.results?.[country]
  const providers: TmdbCountryProviders = providersSlice
    ? {
        link: providersSlice.link ?? '',
        flatrate: providersSlice.flatrate ?? [],
        buy: providersSlice.buy ?? [],
        rent: providersSlice.rent ?? [],
      }
    : EMPTY_PROVIDERS

  return (
    <main className='tv-detail-page'>
      <Link href='/search' className='back-to-library-link'>
        <span className='back-to-library-link-arrow' aria-hidden='true'>
          &lt;
        </span>{' '}
        BACK TO SEARCH
      </Link>
      <DetailHero
        medium='tv'
        mediumLabel={`TV${year !== null ? ` · ${year}` : ''} · PREVIEW`}
        title={tv.name}
        originalTitle={tv.original_name ?? null}
        posterUrl={posterUrl}
        metadata={metadata}
        imdbId={tv.external_ids?.imdb_id ?? null}
        showQbtButton={false}
        actionsOverride={
          <AddToLibraryButton
            source='tmdb'
            sourceId={id}
            type={MediaType.TV_SHOW}
            medium='tv'
          />
        }
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
      <SectionBand title='Cast' count={cast.length}>
        <CastList people={cast} />
      </SectionBand>
      <SectionBand title='Streaming'>
        <StreamingBadges providers={providers} />
      </SectionBand>
    </main>
  )
}
