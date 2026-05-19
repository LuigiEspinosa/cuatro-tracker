import { describe, it, expect } from 'vitest'
import { normaliseRelations } from '@/lib/normalise/anilist-relations'
import type {
  AnilistMediaFormat,
  AnilistRelationBuckets,
  AnilistRelationNode,
} from '@/lib/api/anilist'

function relationNode(
  id: number,
  type: 'ANIME' | 'MANGA' = 'ANIME',
  overrides: Partial<{
    format: AnilistMediaFormat | null
    romaji: string | null
    english: string | null
    native: string | null
    userPreferred: string | null
    coverLarge: string | null
  }> = {},
): AnilistRelationNode {
  const defaultFormat: AnilistMediaFormat = type === 'ANIME' ? 'TV' : 'MANGA'
  return {
    id,
    type,
    format: overrides.format === null ? null : overrides.format ?? defaultFormat,
    title: {
      romaji: overrides.romaji ?? `Romaji ${id}`,
      english: overrides.english ?? null,
      native: overrides.native ?? null,
      userPreferred: overrides.userPreferred ?? `Romaji ${id}`,
    },
    coverImage:
      overrides.coverLarge === null
        ? undefined
        : { large: overrides.coverLarge ?? `https://cdn.example/${id}.jpg` },
  }
}

const emptyBuckets: AnilistRelationBuckets = {
  sequel: [],
  prequel: [],
  sideStory: [],
  parent: [],
  adaptation: [],
}

describe('lib/normalise/anilist-relations', () => {
  it('projects every bucket into the unified NormalisedRelation shape', () => {
    const buckets: AnilistRelationBuckets = {
      sequel: [relationNode(1)],
      prequel: [relationNode(2)],
      sideStory: [relationNode(3)],
      parent: [relationNode(4)],
      adaptation: [relationNode(5, 'MANGA')],
    }

    const result = normaliseRelations(buckets)

    expect(result.sequel).toEqual([
      {
        id: 1,
        title: 'Romaji 1',
        format: 'TV',
        cover_path: 'https://cdn.example/1.jpg',
        relationType: 'SEQUEL',
      },
    ])
    expect(result.prequel[0]?.relationType).toBe('PREQUEL')
    expect(result.sideStory[0]?.relationType).toBe('SIDE_STORY')
    expect(result.parent[0]?.relationType).toBe('PARENT')
    expect(result.adaptation[0]).toMatchObject({
      id: 5,
      format: 'MANGA',
      relationType: 'ADAPTATION',
    })
  })

  it('returns empty arrays (never null) when the source buckets are empty', () => {
    const result = normaliseRelations(emptyBuckets)
    expect(result.sequel).toEqual([])
    expect(result.prequel).toEqual([])
    expect(result.sideStory).toEqual([])
    expect(result.parent).toEqual([])
    expect(result.adaptation).toEqual([])
  })

  it('honours userPreferred title before falling back to romaji', () => {
    const buckets: AnilistRelationBuckets = {
      ...emptyBuckets,
      sequel: [
        relationNode(1, 'ANIME', { userPreferred: 'Locale Title' }),
      ],
    }
    expect(normaliseRelations(buckets).sequel[0]?.title).toBe('Locale Title')
  })

  it('keeps cover_path null when coverImage is absent', () => {
    const buckets: AnilistRelationBuckets = {
      ...emptyBuckets,
      sequel: [relationNode(1, 'ANIME', { coverLarge: null })],
    }
    expect(normaliseRelations(buckets).sequel[0]?.cover_path).toBeNull()
  })
})
