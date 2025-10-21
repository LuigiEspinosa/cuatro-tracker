import { describe, it, expect } from 'vitest'
import { URL } from 'node:url'

function sortByReleaseDate(a: any, b: any) {
  return (b?.release_date || '').localeCompare(a?.release_date || '')
}

describe('sortByReleaseDate', () => {
  it('sorts newest first', () => {
    const arr = [
      { title: 'Old', release_date: '2000-01-01' },
      { title: 'New', release_date: '2024-05-01' },
    ]

    arr.sort(sortByReleaseDate)
    expect(arr[0].title).toBe('New')
  })
})