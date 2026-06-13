import { describe, it, expect } from 'vitest'
import { preferredAnilistTitle } from '@/lib/normalise/anilist-title'
import type { AnilistMedia } from '@/lib/api/anilist'

type AnilistTitle = AnilistMedia['title']

function title(overrides: Partial<AnilistTitle> = {}): AnilistTitle {
  return {
    romaji: null,
    english: null,
    native: null,
    userPreferred: null,
    ...overrides,
  }
}

describe('preferredAnilistTitle', () => {
  it('honours userPreferred ahead of the romaji -> english -> native chain', () => {
    const result = preferredAnilistTitle(
      title({
        userPreferred: 'Sousou no Frieren',
        romaji: 'Sousou no Furiiren',
        english: 'Frieren: Beyond Journeys End',
        native: '葬送のフリーレン',
      }),
      170942,
    )
    expect(result).toBe('Sousou no Frieren')
  })

  it('falls back through romaji, then english, then native', () => {
    expect(preferredAnilistTitle(title({ romaji: 'Berserk' }), 1)).toBe(
      'Berserk',
    )
    expect(preferredAnilistTitle(title({ english: 'Berserk' }), 1)).toBe(
      'Berserk',
    )
    expect(preferredAnilistTitle(title({ native: 'ベルセルク' }), 1)).toBe(
      'ベルセルク',
    )
  })

  it('skips an empty-string field instead of letting it shadow a later one', () => {
    // The pre-fix `??` chain returned '' here because '' is not nullish.
    const result = preferredAnilistTitle(
      title({ userPreferred: '', romaji: '', english: 'Real Title' }),
      1,
    )
    expect(result).toBe('Real Title')
  })

  it('treats a whitespace-only field as blank', () => {
    const result = preferredAnilistTitle(
      title({ romaji: '   ', english: 'Real Title' }),
      1,
    )
    expect(result).toBe('Real Title')
  })

  it('returns the surviving field trimmed (padding never persists)', () => {
    expect(preferredAnilistTitle(title({ romaji: '  Berserk  ' }), 1)).toBe(
      'Berserk',
    )
  })

  it('substitutes an identifiable placeholder when every field is null', () => {
    expect(preferredAnilistTitle(title(), 12345)).toBe('[Untitled #12345]')
  })

  it('substitutes the placeholder when every field is blank or whitespace', () => {
    const result = preferredAnilistTitle(
      title({ userPreferred: '', romaji: '  ', english: '', native: '\t' }),
      999,
    )
    expect(result).toBe('[Untitled #999]')
  })

  it('never returns an empty string', () => {
    const result = preferredAnilistTitle(title(), 7)
    expect(result.length).toBeGreaterThan(0)
  })
})
