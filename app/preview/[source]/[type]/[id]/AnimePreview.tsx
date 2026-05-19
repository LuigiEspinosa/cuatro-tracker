import Link from 'next/link'
import { MediaType } from '@prisma/client'
import {
  getMedia,
  getMediaRelations,
  type AnilistCharacterEdge,
  type AnilistMedia,
} from '@/lib/api/anilist'
import { db } from '@/lib/db'
import {
  normaliseRelations,
  type NormalisedRelationBuckets,
} from '@/lib/normalise/anilist-relations'
import { DetailHero } from '@/components/organisms/DetailHero'
import { SectionBand } from '@/components/organisms/SectionBand/SectionBand'
import { RelationsList } from '@/components/organisms/RelationsList'
import { VoiceCastList } from '@/components/organisms/VoiceCastList'
import type { MetadataItem } from '@/components/molecules/MetadataRow'
import { stripAnilistHtml } from '@/lib/normalise/anilist-html'
import { AddToLibraryButton } from './AddToLibraryButton'

function preferredTitle(t: AnilistMedia['title']): string {
  return (
    t.userPreferred ?? t.romaji ?? t.english ?? t.native ?? 'Untitled'
  )
}

function pickCover(media: AnilistMedia): string | null {
  return (
    media.coverImage?.extraLarge ??
    media.coverImage?.large ??
    media.coverImage?.medium ??
    null
  )
}

async function resolveInLibraryByAnilistId(
  buckets: NormalisedRelationBuckets,
): Promise<Map<number, string>> {
  const allIds = [
    ...buckets.sequel,
    ...buckets.prequel,
    ...buckets.sideStory,
    ...buckets.parent,
    ...buckets.adaptation,
  ].map((r) => r.id)
  if (allIds.length === 0) return new Map()
  const rows = await db.mediaItem.findMany({
    where: { anilist_id: { in: allIds } },
    select: { id: true, anilist_id: true },
  })
  const map = new Map<number, string>()
  for (const r of rows) {
    if (r.anilist_id !== null) map.set(r.anilist_id, r.id)
  }
  return map
}

export async function AnimePreview({ id }: { id: number }) {
  const [media, rawRelations] = await Promise.all([
    getMedia(id, 'ANIME'),
    getMediaRelations(id).catch(() => null),
  ])

  const buckets: NormalisedRelationBuckets =
    rawRelations !== null
      ? normaliseRelations(rawRelations)
      : {
          sequel: [],
          prequel: [],
          sideStory: [],
          parent: [],
          adaptation: [],
        }
  const inLibraryByAnilistId = await resolveInLibraryByAnilistId(buckets)

  const title = preferredTitle(media.title)
  const native = media.title.native ?? null
  const year = media.startDate.year
  const posterUrl = pickCover(media)
  const studioName =
    media.studios?.nodes.find((n) => n.isAnimationStudio)?.name ??
    media.studios?.nodes[0]?.name ??
    null
  const episodeCount = media.episodes ?? null

  const metadata: MetadataItem[] = []
  if (media.format) {
    metadata.push({ value: media.format.replaceAll('_', ' ') })
  }
  if (year !== null) metadata.push({ value: String(year) })
  if (studioName !== null) metadata.push({ value: studioName })
  if (episodeCount !== null) metadata.push({ value: `${episodeCount} EP` })
  if (media.status && media.status.length > 0) {
    metadata.push({
      value: media.status.replaceAll('_', ' ').toUpperCase(),
      dim: true,
    })
  }

  const synopsisParagraphs = stripAnilistHtml(media.description ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const characters: AnilistCharacterEdge[] = media.characters?.edges ?? []
  const hasRelations =
    buckets.sequel.length > 0 ||
    buckets.prequel.length > 0 ||
    buckets.sideStory.length > 0 ||
    buckets.parent.length > 0 ||
    buckets.adaptation.length > 0

  return (
    <main className='anime-detail-page'>
      <Link href='/search' className='back-to-library-link'>
        <span className='back-to-library-link-arrow' aria-hidden='true'>
          &lt;
        </span>{' '}
        BACK TO SEARCH
      </Link>
      <DetailHero
        medium='anime'
        mediumLabel='ANIME · PREVIEW'
        title={title}
        originalTitle={native !== title ? native : null}
        posterUrl={posterUrl}
        metadata={metadata}
        imdbId={null}
        showQbtButton={false}
        actionsOverride={
          <AddToLibraryButton
            source='anilist'
            sourceId={id}
            type={MediaType.ANIME}
            medium='anime'
          />
        }
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
      {studioName !== null ? (
        <SectionBand title='Studios'>
          <span className='anime-detail-studio-chip'>{studioName}</span>
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
            buckets={buckets}
            inLibraryByAnilistId={inLibraryByAnilistId}
          />
        </SectionBand>
      ) : null}
    </main>
  )
}
