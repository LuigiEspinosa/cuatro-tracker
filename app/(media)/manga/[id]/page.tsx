import { notFound } from 'next/navigation'
import { MediaType } from '@prisma/client'
import { db } from '@/lib/db'
import { findUserEntryByMediaItemId } from '@/lib/db/library'
import {
  getMedia,
  getMediaRelations,
  AnilistApiError,
  AnilistNotFoundError,
  type AnilistMedia,
} from '@/lib/api/anilist'
import {
  normaliseRelations,
  type NormalisedRelationBuckets,
} from '@/lib/normalise/anilist-relations'
import { logger } from '@/lib/logger'
import { BackToLibraryLink } from '@/components/molecules/BackToLibraryLink'
import { DetailHero } from '@/components/organisms/DetailHero'
import { SectionBand } from '@/components/organisms/SectionBand/SectionBand'
import { RelationsList } from '@/components/organisms/RelationsList'
import { stripAnilistHtml } from '@/lib/normalise/anilist-html'
import type { MetadataItem } from '@/components/molecules/MetadataRow'
import { MangaDetailControls } from './MangaDetailControls'

export const dynamic = 'force-dynamic'

type PageParams = Promise<{ id: string }>

function deriveYear(d: Date): number | null {
  const y = d.getUTCFullYear()
  return y === 1970 ? null : y
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

type RelationsResolution = {
  buckets: NormalisedRelationBuckets
  inLibraryByAnilistId: Map<number, string>
}

async function resolveRelations(
  anilistId: number,
): Promise<RelationsResolution> {
  const empty: NormalisedRelationBuckets = {
    sequel: [],
    prequel: [],
    sideStory: [],
    parent: [],
    adaptation: [],
  }
  let buckets: NormalisedRelationBuckets = empty
  try {
    const raw = await getMediaRelations(anilistId)
    buckets = normaliseRelations(raw)
  } catch (err) {
    if (err instanceof AnilistApiError || err instanceof AnilistNotFoundError) {
      logger.warn(
        { event: 'manga_detail.relations_unavailable', anilistId, err },
        'AniList relations fetch failed; relations band will be omitted',
      )
    } else {
      throw err
    }
  }

  const allRelationIds = [
    ...buckets.sequel,
    ...buckets.prequel,
    ...buckets.sideStory,
    ...buckets.parent,
    ...buckets.adaptation,
  ].map((r) => r.id)

  const inLibraryByAnilistId = new Map<number, string>()
  if (allRelationIds.length > 0) {
    const rows = await db.mediaItem.findMany({
      where: { anilist_id: { in: allRelationIds } },
      select: { id: true, anilist_id: true },
    })
    for (const r of rows) {
      if (r.anilist_id !== null) inLibraryByAnilistId.set(r.anilist_id, r.id)
    }
  }

  return { buckets, inLibraryByAnilistId }
}

async function resolveAnilistMedia(
  anilistId: number,
): Promise<AnilistMedia | null> {
  try {
    return await getMedia(anilistId, 'MANGA')
  } catch (err) {
    if (err instanceof AnilistApiError || err instanceof AnilistNotFoundError) {
      logger.warn(
        { event: 'manga_detail.media_unavailable', anilistId, err },
        'AniList getMedia failed; ongoing chip will be omitted',
      )
      return null
    }
    throw err
  }
}

export default async function MangaDetailPage({
  params,
}: {
  params: PageParams
}) {
  const { id } = await params
  if (!id) notFound()

  const entry = await findUserEntryByMediaItemId(id)
  if (!entry || entry.media_item.type !== MediaType.MANGA) notFound()
  if (entry.media_item.anilist_id === null) {
    logger.warn(
      { event: 'manga_detail.missing_anilist_id', mediaItemId: id },
      'MANGA row has no anilist_id; rendering 404',
    )
    notFound()
  }

  const anilistId = entry.media_item.anilist_id

  const [media, relations] = await Promise.all([
    resolveAnilistMedia(anilistId),
    resolveRelations(anilistId),
  ])

  const year = deriveYear(entry.media_item.release_date)
  const upstreamStatus = media?.status ?? entry.media_item.status ?? null

  const metadata: MetadataItem[] = []
  if (media?.format) {
    metadata.push({ value: media.format.replaceAll('_', ' ') })
  }
  if (year !== null) metadata.push({ value: String(year) })
  if (entry.media_item.author_name) {
    metadata.push({ value: entry.media_item.author_name })
  }
  if (entry.media_item.chapter_count !== null) {
    metadata.push({ value: `${entry.media_item.chapter_count} CH` })
  }
  if (entry.media_item.volume_count !== null) {
    metadata.push({ value: `${entry.media_item.volume_count} VOL` })
  }
  if (upstreamStatus) {
    metadata.push({
      value: upstreamStatus.replaceAll('_', ' ').toUpperCase(),
      dim: true,
    })
  }

  const synopsisParagraphs = stripAnilistHtml(entry.media_item.overview ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const posterUrl = entry.media_item.poster_path

  const hasRelations =
    relations.buckets.sequel.length > 0 ||
    relations.buckets.prequel.length > 0 ||
    relations.buckets.sideStory.length > 0 ||
    relations.buckets.parent.length > 0 ||
    relations.buckets.adaptation.length > 0

  const hasTrackingAxis =
    entry.media_item.chapter_count !== null ||
    entry.media_item.volume_count !== null

  const genres = entry.media_item.genres ?? []

  return (
    <main className='anime-detail-page'>
      <BackToLibraryLink medium='manga' />
      <DetailHero
        mediaItemId={entry.media_item_id}
        medium='manga'
        mediumLabel='MANGA'
        title={entry.media_item.title}
        originalTitle={entry.media_item.original_title}
        posterUrl={posterUrl}
        metadata={metadata}
        currentStatus={entry.status}
        imdbId={null}
        showQbtButton={false}
      />
      <div className='anime-detail-rule' aria-hidden='true' />
      {synopsisParagraphs.length > 0 ? (
        <article className='anime-detail-synopsis'>
          {synopsisParagraphs.map((para, idx) => (
            <p key={idx}>{para}</p>
          ))}
        </article>
      ) : null}
      <div
        className='anime-detail-rule anime-detail-rule-thick'
        aria-hidden='true'
      />
      {hasTrackingAxis ? (
        <SectionBand title='Chapters'>
          <MangaDetailControls
            mediaItemId={entry.media_item_id}
            chapterCount={entry.media_item.chapter_count}
            volumeCount={entry.media_item.volume_count}
            progress={entry.progress}
            volumeProgress={entry.volume_progress}
            lifecycleStatus={upstreamStatus}
          />
        </SectionBand>
      ) : null}
      {entry.media_item.author_name ? (
        <SectionBand title='Authors'>
          <span className='anime-detail-studio-chip'>
            {entry.media_item.author_name}
          </span>
        </SectionBand>
      ) : null}
      {genres.length > 0 ? (
        <SectionBand title='Genres'>
          <ul className='manga-detail-genre-list'>
            {genres.map((g) => (
              <li key={g} className='anime-detail-studio-chip'>
                {g}
              </li>
            ))}
          </ul>
        </SectionBand>
      ) : null}
      {hasRelations ? (
        <SectionBand title='Relations'>
          <RelationsList
            buckets={relations.buckets}
            inLibraryByAnilistId={relations.inLibraryByAnilistId}
          />
        </SectionBand>
      ) : null}
    </main>
  )
}
