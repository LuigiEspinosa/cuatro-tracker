import { describe, it, expect } from 'vitest'
import { CHAPTERS_PER_VOLUME } from '@/lib/constants/manga'

describe('manga constants', () => {
  it('CHAPTERS_PER_VOLUME is 10 (pinned to the migration backfill SQL)', () => {
    expect(CHAPTERS_PER_VOLUME).toBe(10)
  })
})
