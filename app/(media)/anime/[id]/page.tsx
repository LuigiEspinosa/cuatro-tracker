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
  type AnilistCharacterEdge,
} from '@/lib/api/anilist'
import {
  normaliseRelations,
  type NormalisedRelationBuckets,
} from '@/lib/normalise/anilist-relations'
import { logger } from '@/lib/logger'
import { BackToLibraryLink } from '@/components/molecules/BackToLibraryLink'
import { DetailHero } from '@/components/organisms/DetailHero'
import { SectionBand } from '@/components/organisms/SectionBand/SectionBand'
import { PhosphorBar } from '@/components/atoms/PhosphorBar'
import { RelationsList } from '@/components/organisms/RelationsList'
import { VoiceCastList } from '@/components/organisms/VoiceCastList'
import { stripAnilistHtml } from '@/lib/normalise/anilist-html'
import type { MetadataItem } from '@/components/molecules/MetadataRow'
import { AnimeDetailControls } from './AnimeDetailControls'

export const dynamic = 'force-dynamic'

type PageParams = Promise<{ id: string }>

function deriveYear(d: Date): number | null {
  const y = d.getUTCFullYear()
  return y === 1970 ? null : y
}

// AniList descriptions ship raw HTML (`<br>`, `<i>`, `<a>`, ...) even when the
// query asks for `asHtml: false` — the field's "no HTML" flag normalises line
// breaks but leaves tags. Convert `<br>` variants to paragraph breaks then
// strip remaining tags so the synopsis renders as plain text. Applies at
// render time so legacy MediaItem rows that were normalised before this fix
// still display cleanly without a backfill.


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
        { event: 'anime_detail.relations_unavailable', anilistId, err },
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
    return await getMedia(anilistId, 'ANIME')
  } catch (err) {
    if (err instanceof AnilistApiError || err instanceof AnilistNotFoundError) {
      logger.warn(
        { event: 'anime_detail.media_unavailable', anilistId, err },
        'AniList getMedia failed; voice cast band will be omitted',
      )
      return null
    }
    throw err
  }
}

export default async function AnimeDetailPage({
  params,
}: {
  params: PageParams
}) {
  const { id } = await params
  if (!id) notFound()

  const entry = await findUserEntryByMediaItemId(id)
  if (!entry || entry.media_item.type !== MediaType.ANIME) notFound()
  if (entry.media_item.anilist_id === null) {
    logger.warn(
      { event: 'anime_detail.missing_anilist_id', mediaItemId: id },
      'ANIME row has no anilist_id; rendering 404',
    )
    notFound()
  }

  const anilistId = entry.media_item.anilist_id

  const [media, relations] = await Promise.all([
    resolveAnilistMedia(anilistId),
    resolveRelations(anilistId),
  ])

  const year = deriveYear(entry.media_item.release_date)
  const metadata: MetadataItem[] = []
  if (media?.format) {
    metadata.push({ value: media.format.replaceAll('_', ' ') })
  }
  if (year !== null) metadata.push({ value: String(year) })
  if (entry.media_item.studio_name) {
    metadata.push({ value: entry.media_item.studio_name })
  }
  if (entry.media_item.episode_count !== null) {
    metadata.push({ value: `${entry.media_item.episode_count} EP` })
  }
  if (entry.media_item.lifecycle_status) {
    metadata.push({
      value: entry.media_item.lifecycle_status
        .replaceAll('_', ' ')
        .toUpperCase(),
      dim: true,
    })
  }

  const synopsisParagraphs = stripAnilistHtml(entry.media_item.overview ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  // AniList poster paths are stored as full URLs (per the AniList normaliser).
  // No getImageUrl() construction step like TMDB.
  const posterUrl = entry.media_item.poster_path

  const characters: AnilistCharacterEdge[] = media?.characters?.edges ?? []
  const hasRelations =
    relations.buckets.sequel.length > 0 ||
    relations.buckets.prequel.length > 0 ||
    relations.buckets.sideStory.length > 0 ||
    relations.buckets.parent.length > 0 ||
    relations.buckets.adaptation.length > 0

  return (
    <main className='anime-detail-page'>
      <BackToLibraryLink medium='anime' />
      <DetailHero
        mediaItemId={entry.media_item_id}
        medium='anime'
        mediumLabel='ANIME'
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
      {entry.media_item.episode_count !== null ? (
        <section className='anime-detail-progress' aria-label='Show progress'>
          <p className='anime-detail-progress-label'>
            {entry.progress} / {entry.media_item.episode_count} EPISODES WATCHED
          </p>
          <PhosphorBar
            value={entry.progress}
            max={
              entry.media_item.episode_count > 0
                ? entry.media_item.episode_count
                : 1
            }
            label='Show progress'
          />
        </section>
      ) : null}
      <SectionBand
        title='Episodes'
        count={entry.media_item.episode_count ?? null}
      >
        <AnimeDetailControls
          mediaItemId={entry.media_item_id}
          episodeCount={entry.media_item.episode_count ?? 0}
          progress={entry.progress}
        />
      </SectionBand>
      {entry.media_item.studio_name ? (
        <SectionBand title='Studios'>
          <span className='anime-detail-studio-chip'>
            {entry.media_item.studio_name}
          </span>
        </SectionBand>
      ) : null}
      {characters.length > 0 ? (
        <SectionBand title='Voice Cast' count={characters.length}>
          <VoiceCastList characters={characters} />
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
