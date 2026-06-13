import { describe, it, expect } from 'vitest'
import { MediaType } from '@prisma/client'
import { detailRouteFor } from '@/lib/detail-route'

describe('detailRouteFor', () => {
  it('routes GAME to /games/{id} (Story 10.4 D12, was a latent null)', () => {
    expect(detailRouteFor({ mediaType: MediaType.GAME, mediaItemId: 'g1' })).toBe(
      '/games/g1',
    )
  })

  it('preserves the existing per-medium mappings', () => {
    expect(detailRouteFor({ mediaType: MediaType.MOVIE, mediaItemId: 'm1' })).toBe(
      '/movies/m1',
    )
    expect(detailRouteFor({ mediaType: MediaType.TV_SHOW, mediaItemId: 't1' })).toBe(
      '/tv/t1',
    )
    expect(detailRouteFor({ mediaType: MediaType.ANIME, mediaItemId: 'a1' })).toBe(
      '/anime/a1',
    )
    expect(detailRouteFor({ mediaType: MediaType.MANGA, mediaItemId: 'mg1' })).toBe(
      '/manga/mg1',
    )
  })

  it('returns null for TV_EPISODE (no standalone route, excluded from the timeline)', () => {
    expect(
      detailRouteFor({ mediaType: MediaType.TV_EPISODE, mediaItemId: 'e1' }),
    ).toBeNull()
  })
})
