import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RelationsList } from '@/components/organisms/RelationsList'
import type { NormalisedRelation } from '@/lib/normalise/anilist-relations'

function row(
  overrides: Partial<NormalisedRelation> & { id: number },
): NormalisedRelation {
  return {
    type: 'ANIME',
    title: `Title ${overrides.id}`,
    format: 'TV',
    cover_path: `https://cdn.example/${overrides.id}.jpg`,
    relationType: 'SEQUEL',
    ...overrides,
  }
}

describe('RelationsList', () => {
  it('renders nothing when every bucket is empty', () => {
    const { container } = render(
      <RelationsList
        buckets={{
          sequel: [],
          prequel: [],
          sideStory: [],
          parent: [],
          adaptation: [],
        }}
        inLibraryByAnilistId={new Map()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders sections in the fixed order SEQUELS → PREQUELS → SIDE STORIES → ADAPTATIONS → PARENT', () => {
    render(
      <RelationsList
        buckets={{
          sequel: [row({ id: 1, relationType: 'SEQUEL' })],
          prequel: [row({ id: 2, relationType: 'PREQUEL' })],
          sideStory: [row({ id: 3, relationType: 'SIDE_STORY' })],
          parent: [row({ id: 4, relationType: 'PARENT' })],
          adaptation: [row({ id: 5, type: 'MANGA', relationType: 'ADAPTATION' })],
        }}
        inLibraryByAnilistId={new Map()}
      />,
    )
    const headers = screen
      .getAllByRole('heading', { level: 3 })
      .map((h) => h.textContent)
    expect(headers).toEqual([
      'SEQUELS',
      'PREQUELS',
      'SIDE STORIES',
      'ADAPTATIONS',
      'PARENT',
    ])
  })

  it('omits an empty bucket entirely (no header rendered)', () => {
    render(
      <RelationsList
        buckets={{
          sequel: [row({ id: 1, relationType: 'SEQUEL' })],
          prequel: [],
          sideStory: [],
          parent: [],
          adaptation: [row({ id: 2, type: 'MANGA', relationType: 'ADAPTATION' })],
        }}
        inLibraryByAnilistId={new Map()}
      />,
    )
    expect(screen.getByText('SEQUELS')).toBeInTheDocument()
    expect(screen.getByText('ADAPTATIONS')).toBeInTheDocument()
    expect(screen.queryByText('PREQUELS')).not.toBeInTheDocument()
    expect(screen.queryByText('SIDE STORIES')).not.toBeInTheDocument()
    expect(screen.queryByText('PARENT')).not.toBeInTheDocument()
  })

  it('renders in-library ANIME rows as a Link to /anime/[mediaItemId]', () => {
    render(
      <RelationsList
        buckets={{
          sequel: [row({ id: 100, title: 'Frieren S2', relationType: 'SEQUEL' })],
          prequel: [],
          sideStory: [],
          parent: [],
          adaptation: [],
        }}
        inLibraryByAnilistId={new Map([[100, 'media-item-abc']])}
      />,
    )
    const link = screen.getByRole('link', { name: /Frieren S2/ })
    expect(link.getAttribute('href')).toBe('/anime/media-item-abc')
  })

  it('renders in-library MANGA rows as a Link to /manga/[mediaItemId]', () => {
    render(
      <RelationsList
        buckets={{
          sequel: [],
          prequel: [],
          sideStory: [],
          parent: [],
          adaptation: [
            row({
              id: 200,
              type: 'MANGA',
              title: 'Berserk',
              relationType: 'ADAPTATION',
            }),
          ],
        }}
        inLibraryByAnilistId={new Map([[200, 'media-item-berserk']])}
      />,
    )
    const link = screen.getByRole('link', { name: /Berserk/ })
    expect(link.getAttribute('href')).toBe('/manga/media-item-berserk')
  })

  it('renders out-of-library ANIME rows as a Link to /preview/anilist/anime/<id>', () => {
    render(
      <RelationsList
        buckets={{
          sequel: [row({ id: 777, title: 'Not in Library', relationType: 'SEQUEL' })],
          prequel: [],
          sideStory: [],
          parent: [],
          adaptation: [],
        }}
        inLibraryByAnilistId={new Map()}
      />,
    )
    const link = screen.getByRole('link', { name: /Not in Library/ })
    expect(link.getAttribute('href')).toBe('/preview/anilist/anime/777')
  })

  it('renders out-of-library MANGA rows as a Link to /preview/anilist/manga/<id>', () => {
    render(
      <RelationsList
        buckets={{
          sequel: [],
          prequel: [],
          sideStory: [],
          parent: [],
          adaptation: [
            row({
              id: 888,
              type: 'MANGA',
              title: 'Out of Library Manga',
              relationType: 'ADAPTATION',
            }),
          ],
        }}
        inLibraryByAnilistId={new Map()}
      />,
    )
    const link = screen.getByRole('link', { name: /Out of Library Manga/ })
    expect(link.getAttribute('href')).toBe('/preview/anilist/manga/888')
  })

  it('renders the relation-type chip with underscores replaced by spaces', () => {
    render(
      <RelationsList
        buckets={{
          sequel: [],
          prequel: [],
          sideStory: [row({ id: 1, relationType: 'SIDE_STORY' })],
          parent: [],
          adaptation: [],
        }}
        inLibraryByAnilistId={new Map()}
      />,
    )
    // Chip label is the same as the section header in this case, but the
    // chip lives inside the row, not as the section heading.
    const section = screen.getByRole('heading', { level: 3, name: 'SIDE STORIES' })
      .parentElement
    expect(section).not.toBeNull()
    expect(within(section as HTMLElement).getAllByText('SIDE STORY').length).toBe(1)
  })

  it('marks the row with data-in-library reflecting library presence', () => {
    render(
      <RelationsList
        buckets={{
          sequel: [
            row({ id: 100, title: 'In Library', relationType: 'SEQUEL' }),
            row({ id: 101, title: 'Out of Library', relationType: 'SEQUEL' }),
          ],
          prequel: [],
          sideStory: [],
          parent: [],
          adaptation: [],
        }}
        inLibraryByAnilistId={new Map([[100, 'mi-100']])}
      />,
    )
    const inLib = screen.getByText('In Library').closest('li')
    const outLib = screen.getByText('Out of Library').closest('li')
    expect(inLib?.getAttribute('data-in-library')).toBe('true')
    expect(outLib?.getAttribute('data-in-library')).toBe('false')
  })
})
