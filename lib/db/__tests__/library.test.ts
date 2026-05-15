import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MediaType, WatchStatus } from '@prisma/client'

const dbMock = vi.hoisted(() => ({
  userEntry: { findMany: vi.fn(), findUnique: vi.fn() },
  mediaItem: { groupBy: vi.fn() },
}))

vi.mock('@/lib/db', () => ({ db: dbMock }))

const validEnv: Record<string, string> = {
  NEXTAUTH_SECRET: 'a'.repeat(32),
  NEXTAUTH_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://tracker:password@localhost:5432/tracker',
  REDIS_URL: 'redis://localhost:6379',
  ADMIN_PASS: 'password123',
  DB_PASS: 'password',
  TMDB_API_KEY: 'tmdb-key',
  IGDB_CLIENT_ID: 'igdb-id',
  IGDB_CLIENT_SECRET: 'igdb-secret',
  STEAM_API_KEY: 'steam-key',
  STEAM_USER_ID: '76561197960287930',
  QBITTORRENT_HOST: 'http://qbittorrent:8080',
  QBITTORRENT_USER: 'admin',
  QBITTORRENT_PASS: 'qbpass',
  DOWNLOAD_PATH: '/downloads',
  LOG_LEVEL: 'info',
}

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  for (const [k, v] of Object.entries(validEnv)) vi.stubEnv(k, v)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function tvShowEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tv-entry-1',
    media_item_id: 'tv-show-1',
    status: WatchStatus.WATCHING,
    user_rating: null,
    progress: 0,
    notes: null,
    started_at: null,
    completed_at: null,
    created_at: new Date('2026-05-10T12:00:00Z'),
    updated_at: new Date('2026-05-12T12:00:00Z'),
    media_item: {
      id: 'tv-show-1',
      type: MediaType.TV_SHOW,
      title: 'Breaking Bad',
      lifecycle_status: 'ended',
    },
    ...overrides,
  }
}

describe('findLibraryItems: episodeStats attachment (Story 7.4 AC-2)', () => {
  it('attaches episodeStats with watched + total + latest S/E for TV_SHOW entries', async () => {
    const entry = tvShowEntry()
    dbMock.userEntry.findMany.mockImplementation(
      (args: { where?: { media_item?: { parent_id?: unknown } } }) => {
        if (args?.where?.media_item?.parent_id) {
          // Second call: watched episodes lookup.
          return Promise.resolve([
            { media_item: { parent_id: 'tv-show-1', season_number: 2, episode_number: 4 } },
            { media_item: { parent_id: 'tv-show-1', season_number: 2, episode_number: 3 } },
            { media_item: { parent_id: 'tv-show-1', season_number: 1, episode_number: 1 } },
          ])
        }
        return Promise.resolve([entry])
      },
    )
    dbMock.mediaItem.groupBy.mockResolvedValue([
      { parent_id: 'tv-show-1', _count: { id: 10 } },
    ])

    const { findLibraryItems } = await import('@/lib/db/library')
    const result = await findLibraryItems({ mediaType: MediaType.TV_SHOW })

    expect(result).toHaveLength(1)
    expect(result[0].episodeStats).toEqual({
      total: 10,
      watched: 3,
      latestS: 2,
      latestE: 4,
    })
  })

  it('skips episodeStats attachment when no TV_SHOW entries are returned (no follow-up queries fire)', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([])
    const { findLibraryItems } = await import('@/lib/db/library')
    await findLibraryItems({ mediaType: MediaType.MOVIE })

    expect(dbMock.mediaItem.groupBy).not.toHaveBeenCalled()
    // Primary findMany was called once; no second watched-episodes call.
    expect(dbMock.userEntry.findMany).toHaveBeenCalledTimes(1)
  })

  it('returns zero stats when the show has no watched episodes', async () => {
    const entry = tvShowEntry({ status: WatchStatus.PLAN_TO_WATCH })
    dbMock.userEntry.findMany.mockImplementation(
      (args: { where?: { media_item?: { parent_id?: unknown } } }) => {
        if (args?.where?.media_item?.parent_id) return Promise.resolve([])
        return Promise.resolve([entry])
      },
    )
    dbMock.mediaItem.groupBy.mockResolvedValue([
      { parent_id: 'tv-show-1', _count: { id: 10 } },
    ])

    const { findLibraryItems } = await import('@/lib/db/library')
    const result = await findLibraryItems({ mediaType: MediaType.TV_SHOW })

    expect(result[0].episodeStats).toEqual({
      total: 10,
      watched: 0,
      latestS: null,
      latestE: null,
    })
  })

  it('reports zero total when the show has no aired episodes (announced-only)', async () => {
    const entry = tvShowEntry({ status: WatchStatus.PLAN_TO_WATCH })
    dbMock.userEntry.findMany.mockImplementation(
      (args: { where?: { media_item?: { parent_id?: unknown } } }) => {
        if (args?.where?.media_item?.parent_id) return Promise.resolve([])
        return Promise.resolve([entry])
      },
    )
    // groupBy returns no row for this show — Prisma omits zero-count groups.
    dbMock.mediaItem.groupBy.mockResolvedValue([])

    const { findLibraryItems } = await import('@/lib/db/library')
    const result = await findLibraryItems({ mediaType: MediaType.TV_SHOW })

    expect(result[0].episodeStats).toEqual({
      total: 0,
      watched: 0,
      latestS: null,
      latestE: null,
    })
  })

  it('handles Specials S0E0 episode without collapsing to the sentinel (ECH-T9 patch)', async () => {
    const entry = tvShowEntry()
    dbMock.userEntry.findMany.mockImplementation(
      (args: { where?: { media_item?: { parent_id?: unknown } } }) => {
        if (args?.where?.media_item?.parent_id) {
          return Promise.resolve([
            { media_item: { parent_id: 'tv-show-1', season_number: 0, episode_number: 0 } },
          ])
        }
        return Promise.resolve([entry])
      },
    )
    dbMock.mediaItem.groupBy.mockResolvedValue([
      { parent_id: 'tv-show-1', _count: { id: 5 } },
    ])

    const { findLibraryItems } = await import('@/lib/db/library')
    const result = await findLibraryItems({ mediaType: MediaType.TV_SHOW })

    // After the -1 init fix, S0E0 wins on the first comparison (0 > -1).
    expect(result[0].episodeStats).toEqual({
      total: 5,
      watched: 1,
      latestS: 0,
      latestE: 0,
    })
  })
})

describe('findLibraryItems: lifecycle filters (Story 7.4 AC-6)', () => {
  it('applies lifecycleStatus to media_item.lifecycle_status WHERE clause', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([])
    const { findLibraryItems } = await import('@/lib/db/library')
    await findLibraryItems({ lifecycleStatus: 'continuing' })

    const call = dbMock.userEntry.findMany.mock.calls[0][0]
    expect(call.where.media_item.lifecycle_status).toBe('continuing')
  })

  it('lifecycleInProgress sets WATCHING status AND lifecycle_status=continuing', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([])
    const { findLibraryItems } = await import('@/lib/db/library')
    await findLibraryItems({ lifecycleInProgress: true })

    const call = dbMock.userEntry.findMany.mock.calls[0][0]
    expect(call.where.status).toBe(WatchStatus.WATCHING)
    expect(call.where.media_item.lifecycle_status).toBe('continuing')
  })

  it('lifecycleInProgress overrides an explicit status arg (composite ergonomic)', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([])
    const { findLibraryItems } = await import('@/lib/db/library')
    await findLibraryItems({
      status: WatchStatus.COMPLETED,
      lifecycleInProgress: true,
    })

    const call = dbMock.userEntry.findMany.mock.calls[0][0]
    expect(call.where.status).toBe(WatchStatus.WATCHING)
  })

  it('lifecycleStatus=ended does NOT pin status (only filters media_item)', async () => {
    dbMock.userEntry.findMany.mockResolvedValue([])
    const { findLibraryItems } = await import('@/lib/db/library')
    await findLibraryItems({ lifecycleStatus: 'ended' })

    const call = dbMock.userEntry.findMany.mock.calls[0][0]
    expect(call.where.status).toBeUndefined()
    expect(call.where.media_item.lifecycle_status).toBe('ended')
  })
})

describe('formatTvProgressLabel + formatTvProgressPct (Story 7.4 hoisted helpers)', () => {
  it('returns null for PLAN_TO_WATCH with no stats', async () => {
    const { formatTvProgressLabel, formatTvProgressPct } = await import('@/lib/db/library')
    expect(formatTvProgressLabel(WatchStatus.PLAN_TO_WATCH, undefined)).toBeNull()
    expect(formatTvProgressPct(undefined)).toBeNull()
  })

  it('returns status label for WATCHING with zero total', async () => {
    const { formatTvProgressLabel } = await import('@/lib/db/library')
    const stats = { total: 0, watched: 0, latestS: null, latestE: null }
    expect(formatTvProgressLabel(WatchStatus.WATCHING, stats)).toBe('WATCHING')
  })

  it('formats S{n}E{m} / {total} when watched > 0', async () => {
    const { formatTvProgressLabel } = await import('@/lib/db/library')
    const stats = { total: 10, watched: 4, latestS: 2, latestE: 4 }
    expect(formatTvProgressLabel(WatchStatus.WATCHING, stats)).toBe('S2E4 / 10')
  })

  it('formatTvProgressPct rounds to nearest integer', async () => {
    const { formatTvProgressPct } = await import('@/lib/db/library')
    // 7/10 → 70, 5/7 → 71 (rounded from 71.4...), 199/200 → 100
    expect(formatTvProgressPct({ total: 10, watched: 7, latestS: null, latestE: null })).toBe(70)
    expect(formatTvProgressPct({ total: 7, watched: 5, latestS: null, latestE: null })).toBe(71)
    expect(formatTvProgressPct({ total: 200, watched: 199, latestS: null, latestE: null })).toBe(100)
  })
})
