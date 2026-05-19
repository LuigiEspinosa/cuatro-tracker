import Link from 'next/link'
import { FramedCover } from '@/components/molecules/FramedCover'
import type { NormalisedRelation, NormalisedRelationBuckets } from '@/lib/normalise/anilist-relations'

export type RelationsListProps = {
  buckets: NormalisedRelationBuckets
  // Presence in the map = in-library; value = MediaItem.id for the detail
  // route. Absence = out-of-library; row renders an ADD TO LIBRARY button
  // targeting /search?type=anime|manga&prefill=anilist:<id>. The Story 8.5a
  // follow-up will teach GlobalSearch to consume `prefill` (per OI #1); until
  // then the link target is correct but the search-route prefill is a no-op.
  inLibraryByAnilistId: Map<number, string>
}

type Section = {
  key: keyof NormalisedRelationBuckets
  header: string
  rows: NormalisedRelation[]
}

function buildSections(buckets: NormalisedRelationBuckets): Section[] {
  // AC-6: fixed order SEQUELS → PREQUELS → SIDE STORIES → ADAPTATIONS → PARENT.
  return [
    { key: 'sequel', header: 'SEQUELS', rows: buckets.sequel },
    { key: 'prequel', header: 'PREQUELS', rows: buckets.prequel },
    { key: 'sideStory', header: 'SIDE STORIES', rows: buckets.sideStory },
    { key: 'adaptation', header: 'ADAPTATIONS', rows: buckets.adaptation },
    { key: 'parent', header: 'PARENT', rows: buckets.parent },
  ]
}

function relationChipLabel(relationType: string): string {
  return relationType.replaceAll('_', ' ')
}

function detailRouteFor(type: 'ANIME' | 'MANGA', mediaItemId: string): string {
  return type === 'ANIME'
    ? `/anime/${mediaItemId}`
    : `/manga/${mediaItemId}`
}

function searchPrefillUrl(type: 'ANIME' | 'MANGA', anilistId: number): string {
  const t = type === 'ANIME' ? 'anime' : 'manga'
  return `/search?type=${t}&prefill=anilist:${anilistId}`
}

function coverMedium(type: 'ANIME' | 'MANGA'): 'anime' | 'manga' {
  return type === 'ANIME' ? 'anime' : 'manga'
}

export function RelationsList({
  buckets,
  inLibraryByAnilistId,
}: RelationsListProps) {
  const sections = buildSections(buckets).filter((s) => s.rows.length > 0)
  if (sections.length === 0) return null

  return (
    <div className='relations-list'>
      {sections.map((section) => (
        <section
          key={section.key}
          className='relations-list-section'
          aria-labelledby={`relations-${section.key}-header`}
        >
          <h3
            id={`relations-${section.key}-header`}
            className='relations-list-section-header'
          >
            {section.header}
          </h3>
          <ul className='relations-list-rows'>
            {section.rows.map((row) => {
              const mediaItemId = inLibraryByAnilistId.get(row.id)
              const isInLibrary = mediaItemId !== undefined
              const chip = relationChipLabel(row.relationType)
              const medium = coverMedium(row.type)
              const cover = (
                <FramedCover
                  medium={medium}
                  size='thumb'
                  src={row.cover_path ?? '/placeholder-cover.png'}
                  alt={row.title}
                />
              )
              return (
                <li
                  key={`${row.relationType}-${row.id}`}
                  className='relations-list-row'
                  data-in-library={isInLibrary ? 'true' : 'false'}
                >
                  {isInLibrary ? (
                    <Link
                      href={detailRouteFor(row.type, mediaItemId)}
                      className='relations-list-row-link'
                    >
                      <span className='relations-list-row-cover'>{cover}</span>
                      <span className='relations-list-row-title'>
                        {row.title}
                      </span>
                      <span className='relations-list-row-chip'>{chip}</span>
                    </Link>
                  ) : (
                    <div className='relations-list-row-out-of-library'>
                      <span className='relations-list-row-cover'>{cover}</span>
                      <span className='relations-list-row-title'>
                        {row.title}
                      </span>
                      <span className='relations-list-row-chip'>{chip}</span>
                      <Link
                        href={searchPrefillUrl(row.type, row.id)}
                        className='relations-list-row-add cpb'
                      >
                        &gt; ADD TO LIBRARY
                      </Link>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
