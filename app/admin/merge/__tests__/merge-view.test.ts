import { describe, it, expect } from 'vitest'
import { MediaType } from '@prisma/client'
import type { MediaItem } from '@prisma/client'
import { buildMergeDiff, serializeRecord } from '@/app/admin/merge/merge-view'

function makeMediaItem(overrides: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'mi_1',
    type: MediaType.MOVIE,
    title: 'Blade Runner',
    original_title: null,
    release_date: new Date('1982-06-25T00:00:00Z'),
    end_date: null,
    poster_path: '/poster.jpg',
    backdrop_path: null,
    still_path: null,
    overview: 'A blade runner must pursue four replicants.',
    genres: ['Sci-Fi', 'Thriller'],
    rating: null,
    popularity: null,
    status: null,
    lifecycle_status: null,
    tmdb_id: 78,
    anilist_id: null,
    igdb_id: null,
    steam_app_id: null,
    parent_id: null,
    franchise_id: null,
    season_number: null,
    episode_number: null,
    runtime: null,
    unaired: false,
    episode_count: null,
    chapter_count: null,
    volume_count: null,
    format: null,
    studio_name: null,
    author_name: null,
    season: null,
    season_year: null,
    source_material: null,
    screenshots: [],
    platforms: [],
    developer_name: null,
    publisher_name: null,
    playtime_minutes: null,
    last_played: null,
    achievement_sync_status: 'never_synced',
    created_at: new Date('2026-07-01T00:00:00Z'),
    updated_at: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  }
}

describe('buildMergeDiff', () => {
  it('marks identical core fields as matching and differing ones as not', () => {
    const source = makeMediaItem({ release_date: new Date('1981-06-25T00:00:00Z') })
    const target = makeMediaItem({ tmdb_id: 78 })
    const diff = buildMergeDiff(source, target)

    const byField = Object.fromEntries(diff.map((r) => [r.field, r]))
    expect(byField.title.match).toBe(true)
    expect(byField.type.match).toBe(true)
    // 1981 vs 1982 differ.
    expect(byField.release_year.match).toBe(false)
    expect(byField.release_year.source).toBe('1981')
    expect(byField.release_year.target).toBe('1982')
    expect(byField.genres.match).toBe(true)
  })

  it('always emits the core fields (title, type, release year)', () => {
    const item = makeMediaItem()
    const fields = buildMergeDiff(item, item).map((r) => r.field)
    expect(fields).toContain('title')
    expect(fields).toContain('type')
    expect(fields).toContain('release_year')
  })

  it('drops a non-core row when neither side carries a value', () => {
    // Both original_title null, both genres empty -> those rows are dropped.
    const bare = makeMediaItem({ original_title: null, genres: [] })
    const fields = buildMergeDiff(bare, bare).map((r) => r.field)
    expect(fields).not.toContain('original_title')
    expect(fields).not.toContain('genres')
  })

  it('keeps a non-core row when only one side has a value', () => {
    const source = makeMediaItem({ original_title: 'Blade Runner' })
    const target = makeMediaItem({ original_title: null })
    const row = buildMergeDiff(source, target).find(
      (r) => r.field === 'original_title',
    )
    expect(row).toBeDefined()
    expect(row?.source).toBe('Blade Runner')
    expect(row?.target).toBe('')
    expect(row?.match).toBe(false)
  })

  it('adds per-medium rows for anime and compares them', () => {
    const source = makeMediaItem({
      type: MediaType.ANIME,
      tmdb_id: null,
      anilist_id: 1,
      episode_count: 24,
      studio_name: 'Sunrise',
    })
    const target = makeMediaItem({
      type: MediaType.ANIME,
      tmdb_id: null,
      anilist_id: 43,
      episode_count: 26,
      studio_name: 'Sunrise',
    })
    const byField = Object.fromEntries(
      buildMergeDiff(source, target).map((r) => [r.field, r]),
    )
    expect(byField.episodes.source).toBe('24')
    expect(byField.episodes.target).toBe('26')
    expect(byField.episodes.match).toBe(false)
    expect(byField.studio.match).toBe(true)
    // The differing external ids surface as a Source ID diff row.
    expect(byField.source_id.source).toBe('AniList #1')
    expect(byField.source_id.target).toBe('AniList #43')
    expect(byField.source_id.match).toBe(false)
  })

  it('adds game-specific rows for GAME pairs', () => {
    const source = makeMediaItem({
      type: MediaType.GAME,
      tmdb_id: null,
      igdb_id: 5,
      developer_name: 'Team A',
      publisher_name: 'Pub A',
      platforms: ['PC'],
    })
    const target = makeMediaItem({
      type: MediaType.GAME,
      tmdb_id: null,
      igdb_id: 6,
      developer_name: 'Team A',
      publisher_name: 'Pub B',
      platforms: ['PC', 'PlayStation 5'],
    })
    const byField = Object.fromEntries(
      buildMergeDiff(source, target).map((r) => [r.field, r]),
    )
    expect(byField.developer.match).toBe(true)
    expect(byField.publisher.match).toBe(false)
    expect(byField.platforms.source).toBe('PC')
    expect(byField.platforms.target).toBe('PC · PlayStation 5')
  })
})

describe('serializeRecord', () => {
  it('builds a TMDB poster URL for movies and derives labels', () => {
    const view = serializeRecord(makeMediaItem())
    expect(view.medium).toBe('movies')
    expect(view.typeLabel).toBe('MOVIE')
    expect(view.releaseYear).toBe('1982')
    expect(view.sourceLabel).toBe('From TMDB')
    expect(view.externalId).toBe('TMDB #78')
    expect(view.posterUrl).toBe('https://image.tmdb.org/t/p/w342/poster.jpg')
    expect(view.genres).toBe('Sci-Fi · Thriller')
  })

  it('builds an IGDB cover URL for games and passes AniList URLs through', () => {
    const game = serializeRecord(
      makeMediaItem({ type: MediaType.GAME, poster_path: 'co1uii' }),
    )
    expect(game.posterUrl).toBe(
      'https://images.igdb.com/igdb/image/upload/t_cover_big/co1uii.jpg',
    )

    const anime = serializeRecord(
      makeMediaItem({
        type: MediaType.ANIME,
        poster_path: 'https://s4.anilist.co/cover.jpg',
      }),
    )
    expect(anime.posterUrl).toBe('https://s4.anilist.co/cover.jpg')
  })

  it('returns a null poster when poster_path is null', () => {
    const view = serializeRecord(makeMediaItem({ poster_path: null }))
    expect(view.posterUrl).toBeNull()
  })
})
