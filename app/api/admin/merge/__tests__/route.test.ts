import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { WatchStatus } from '@prisma/client'

const loggerMock = vi.hoisted(() => ({
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  trace: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: loggerMock,
  createLogger: () => loggerMock,
}))

const txMock = vi.hoisted(() => ({
  userEntry: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  mediaItem: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  achievement: {
    count: vi.fn(),
    updateMany: vi.fn(),
  },
  mergeSuggestion: {
    update: vi.fn(),
  },
}))

const dbMock = vi.hoisted(() => ({
  mergeSuggestion: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: dbMock }))

// The route imports the queue registry to enqueue the post-merge rescan (Story
// 11.6). Mocking it keeps the suite off real Redis: building the registry for
// real would open BullMQ connections at module load.
const queueAddMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/jobs/queues', () => ({
  queues: [{ name: 'similarityScan', queue: { add: queueAddMock } }],
}))

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
  // Run the $transaction callback against the chain-mocked tx so each test wires
  // only the tx method behaviour, not the transaction shell.
  dbMock.$transaction.mockImplementation(
    async (fn: (tx: typeof txMock) => unknown) => fn(txMock),
  )
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function postRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost/api/admin/merge'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function newSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sug_1',
    source_id: 'src_1',
    target_id: 'tgt_1',
    confidence: 0.94,
    resolved: false,
    dismissed: false,
    resolved_at: null,
    created_at: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  }
}

function newEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ue_x',
    media_item_id: 'src_1',
    status: WatchStatus.PLAN_TO_WATCH,
    user_rating: null,
    progress: 0,
    volume_progress: 0,
    notes: null,
    started_at: null,
    completed_at: null,
    created_at: new Date('2026-07-01T00:00:00Z'),
    updated_at: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  }
}

const validBody = { suggestionId: 'sug_1', sourceId: 'src_1', targetId: 'tgt_1' }

describe('POST /api/admin/merge', () => {
  describe('body validation', () => {
    it('returns 400 invalid_json when body is not parseable', async () => {
      const { POST } = await import('@/app/api/admin/merge/route')
      const req = new NextRequest(new URL('http://localhost/api/admin/merge'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'not-json',
      })
      const res = await POST(req)

      expect(res.status).toBe(400)
      expect((await res.json()).reason).toBe('invalid_json')
    })

    it('returns 400 when a field is missing', async () => {
      const { POST } = await import('@/app/api/admin/merge/route')
      const res = await POST(postRequest({ suggestionId: 'sug_1' }))

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_body')
    })
  })

  describe('lookup guards', () => {
    it('returns 404 when the suggestion does not exist', async () => {
      dbMock.mergeSuggestion.findUnique.mockResolvedValue(null)
      const { POST } = await import('@/app/api/admin/merge/route')
      const res = await POST(postRequest(validBody))

      expect(res.status).toBe(404)
      expect(dbMock.$transaction).not.toHaveBeenCalled()
    })

    it('returns 404 when the suggestion is already resolved', async () => {
      dbMock.mergeSuggestion.findUnique.mockResolvedValue(
        newSuggestion({ resolved: true }),
      )
      const { POST } = await import('@/app/api/admin/merge/route')
      const res = await POST(postRequest(validBody))

      expect(res.status).toBe(404)
      expect(dbMock.$transaction).not.toHaveBeenCalled()
    })

    it('returns 409 when the body ids do not match the row', async () => {
      dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
      const { POST } = await import('@/app/api/admin/merge/route')
      const res = await POST(
        postRequest({ ...validBody, targetId: 'someone_else' }),
      )

      expect(res.status).toBe(409)
      expect((await res.json()).error).toBe('mismatch')
      expect(dbMock.$transaction).not.toHaveBeenCalled()
    })
  })

  describe('transaction shape', () => {
    it('re-points a lone source entry, repoints children, resolves, deletes source', async () => {
      dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
      dbMock.mergeSuggestion.findFirst.mockResolvedValue({ id: 'sug_2' })
      // Source has an entry; target has none.
      txMock.userEntry.findUnique
        .mockResolvedValueOnce(newEntry({ id: 'ue_src', media_item_id: 'src_1' }))
        .mockResolvedValueOnce(null)

      const { POST } = await import('@/app/api/admin/merge/route')
      const res = await POST(postRequest(validBody))

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ resolvedId: 'sug_1', next: 'sug_2' })

      // Re-point, not merge+delete.
      expect(txMock.userEntry.update).toHaveBeenCalledWith({
        where: { id: 'ue_src' },
        data: { media_item_id: 'tgt_1' },
      })
      expect(txMock.userEntry.delete).not.toHaveBeenCalled()
      // Children re-pointed.
      expect(txMock.mediaItem.updateMany).toHaveBeenCalledWith({
        where: { parent_id: 'src_1' },
        data: { parent_id: 'tgt_1' },
      })
      // No explicit resolved / resolved_at stamp: the source-delete cascade
      // (MergeSuggestion.source is onDelete: Cascade) removes the row, so a
      // stamp would be dead work.
      expect(txMock.mergeSuggestion.update).not.toHaveBeenCalled()
      // Source MediaItem deleted (cascades the suggestion row away).
      expect(txMock.mediaItem.delete).toHaveBeenCalledWith({
        where: { id: 'src_1' },
      })
    })

    it('merges conflicting entries into the target keeping the higher progress and more-advanced status', async () => {
      dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
      dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
      txMock.userEntry.findUnique
        .mockResolvedValueOnce(
          newEntry({
            id: 'ue_src',
            media_item_id: 'src_1',
            progress: 12,
            volume_progress: 2,
            status: WatchStatus.COMPLETED,
            user_rating: 9,
            completed_at: new Date('2026-06-01T00:00:00Z'),
          }),
        )
        .mockResolvedValueOnce(
          newEntry({
            id: 'ue_tgt',
            media_item_id: 'tgt_1',
            progress: 4,
            volume_progress: 0,
            status: WatchStatus.WATCHING,
            user_rating: null,
            completed_at: null,
          }),
        )

      const { POST } = await import('@/app/api/admin/merge/route')
      const res = await POST(postRequest(validBody))

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ resolvedId: 'sug_1', next: null })

      const mergeCall = txMock.userEntry.update.mock.calls[0][0]
      expect(mergeCall.where).toEqual({ id: 'ue_tgt' })
      expect(mergeCall.data.progress).toBe(12)
      expect(mergeCall.data.volume_progress).toBe(2)
      expect(mergeCall.data.status).toBe(WatchStatus.COMPLETED)
      // Target rating / completed_at were null, so the source's fill in.
      expect(mergeCall.data.user_rating).toBe(9)
      expect(mergeCall.data.completed_at).toEqual(new Date('2026-06-01T00:00:00Z'))
      // Source entry deleted after the merge.
      expect(txMock.userEntry.delete).toHaveBeenCalledWith({
        where: { id: 'ue_src' },
      })
    })

    it('prefers the target non-null fields over the source', async () => {
      dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
      dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
      txMock.userEntry.findUnique
        .mockResolvedValueOnce(
          newEntry({ id: 'ue_src', user_rating: 3, notes: 'source note' }),
        )
        .mockResolvedValueOnce(
          newEntry({
            id: 'ue_tgt',
            media_item_id: 'tgt_1',
            user_rating: 8,
            notes: 'target note',
          }),
        )

      const { POST } = await import('@/app/api/admin/merge/route')
      await POST(postRequest(validBody))

      const mergeCall = txMock.userEntry.update.mock.calls[0][0]
      expect(mergeCall.data.user_rating).toBe(8)
      expect(mergeCall.data.notes).toBe('target note')
    })

    it('skips all UserEntry work when the source has no entry', async () => {
      dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
      dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
      txMock.userEntry.findUnique.mockResolvedValueOnce(null)

      const { POST } = await import('@/app/api/admin/merge/route')
      const res = await POST(postRequest(validBody))

      expect(res.status).toBe(200)
      expect(txMock.userEntry.update).not.toHaveBeenCalled()
      expect(txMock.userEntry.delete).not.toHaveBeenCalled()
      // Children still repointed and source still deleted.
      expect(txMock.mediaItem.updateMany).toHaveBeenCalled()
      expect(txMock.mediaItem.delete).toHaveBeenCalledWith({
        where: { id: 'src_1' },
      })
    })
  })

  describe('post-merge similarity scan', () => {
    it('enqueues a rescan for the surviving target after the merge commits', async () => {
      dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
      dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
      txMock.userEntry.findUnique.mockResolvedValueOnce(null)

      const { POST } = await import('@/app/api/admin/merge/route')
      const res = await POST(postRequest(validBody))

      expect(res.status).toBe(200)
      // namedRole 'target': tgt_1 is the survivor, so it must land on the side
      // an accepted suggestion KEEPS. Naming it source would make the rescan
      // propose deleting the row this merge just preserved.
      expect(queueAddMock).toHaveBeenCalledWith(
        'scan',
        { mediaItemIds: ['tgt_1'], namedRole: 'target' },
        { jobId: 'similarityScan:merge:sug_1' },
      )
    })

    it('still returns 200 when the enqueue throws', async () => {
      dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
      dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
      txMock.userEntry.findUnique.mockResolvedValueOnce(null)
      queueAddMock.mockRejectedValue(new Error('redis down'))

      const { POST } = await import('@/app/api/admin/merge/route')
      const res = await POST(postRequest(validBody))

      // The merge already committed, so a queue failure must not downgrade it.
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ resolvedId: 'sug_1', next: null })
      expect(txMock.mediaItem.delete).toHaveBeenCalledWith({
        where: { id: 'src_1' },
      })
      expect(loggerMock.warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'admin.merge.scan_enqueue_failed' }),
        expect.any(String),
      )
    })
  })
})

describe('POST /api/admin/merge source-only data preservation', () => {
  function carriedRow(overrides: Record<string, unknown> = {}) {
    return {
      steam_app_id: null,
      igdb_id: null,
      tmdb_id: null,
      anilist_id: null,
      playtime_minutes: null,
      last_played: null,
      achievement_sync_status: 'never_synced',
      ...overrides,
    }
  }

  const lastPlayed = new Date('2026-05-01T00:00:00Z')

  it('carries the Steam source fields and achievements onto a metadata-rich IGDB target', async () => {
    dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
    dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
    txMock.userEntry.findUnique.mockResolvedValue(null)
    txMock.mediaItem.findUnique
      // Source: the enriched Steam row.
      .mockResolvedValueOnce(
        carriedRow({
          steam_app_id: 1245620,
          playtime_minutes: 4200,
          last_played: lastPlayed,
          achievement_sync_status: 'synced',
        }),
      )
      // Target: the canonical IGDB row, which carries no Steam data.
      .mockResolvedValueOnce(carriedRow({ igdb_id: 119133 }))
    txMock.achievement.count.mockResolvedValue(0)
    txMock.achievement.updateMany.mockResolvedValue({ count: 42 })

    const { POST } = await import('@/app/api/admin/merge/route')
    const res = await POST(postRequest(validBody))

    expect(res.status).toBe(200)

    // Achievements move BEFORE the delete, or the cascade eats them.
    expect(txMock.achievement.updateMany).toHaveBeenCalledWith({
      where: { game_id: 'src_1' },
      data: { game_id: 'tgt_1' },
    })
    const repointOrder =
      txMock.achievement.updateMany.mock.invocationCallOrder[0]!
    const deleteOrder = txMock.mediaItem.delete.mock.invocationCallOrder[0]!
    const fillOrder = txMock.mediaItem.update.mock.invocationCallOrder[0]!
    expect(repointOrder).toBeLessThan(deleteOrder)
    // The target fill runs AFTER the delete, or the unique source-id columns
    // collide with the row that still holds them.
    expect(fillOrder).toBeGreaterThan(deleteOrder)

    expect(txMock.mediaItem.update).toHaveBeenCalledWith({
      where: { id: 'tgt_1' },
      data: {
        steam_app_id: 1245620,
        igdb_id: undefined,
        tmdb_id: undefined,
        anilist_id: undefined,
        playtime_minutes: 4200,
        last_played: lastPlayed,
        // Rides along with the achievements: without it the survivor keeps its
        // own never_synced and the game page renders the NOT YET SYNCED banner
        // instead of the 42 rows that were just preserved.
        achievement_sync_status: 'synced',
      },
    })
  })

  it('does not re-point achievements onto a target that keeps a different Steam appid', async () => {
    dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
    dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
    txMock.userEntry.findUnique.mockResolvedValue(null)
    txMock.mediaItem.findUnique
      .mockResolvedValueOnce(carriedRow({ steam_app_id: 620 }))
      // Steam-linked to a different game and never synced, so it has no
      // achievements of its own. An empty target is not on its own a licence.
      .mockResolvedValueOnce(carriedRow({ steam_app_id: 440 }))
    txMock.achievement.count.mockResolvedValueOnce(0).mockResolvedValueOnce(42)

    const { POST } = await import('@/app/api/admin/merge/route')
    const res = await POST(postRequest(validBody))

    expect(res.status).toBe(200)
    // The survivor keeps appid 440, so taking 620's achievements would leave it
    // owning another game's rows and colliding on its own next sync.
    expect(txMock.achievement.updateMany).not.toHaveBeenCalled()
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'admin.merge.achievements.dropped',
        count: 42,
        reason: 'target_keeps_another_appid',
      }),
      expect.any(String),
    )
  })

  it('carries the higher playtime when the target already holds a real zero', async () => {
    dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
    dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
    txMock.userEntry.findUnique.mockResolvedValue(null)
    txMock.mediaItem.findUnique
      .mockResolvedValueOnce(carriedRow({ steam_app_id: 620, playtime_minutes: 4200 }))
      // The bulk import writes playtime_forever straight through, so a
      // never-played Steam row lands at 0 rather than null. A null-only fill
      // reads that as "already set" and throws the 4200 away.
      .mockResolvedValueOnce(carriedRow({ playtime_minutes: 0 }))
    txMock.achievement.count.mockResolvedValue(0)
    txMock.achievement.updateMany.mockResolvedValue({ count: 0 })

    const { POST } = await import('@/app/api/admin/merge/route')
    const res = await POST(postRequest(validBody))

    expect(res.status).toBe(200)
    expect(txMock.mediaItem.update).toHaveBeenCalledWith({
      where: { id: 'tgt_1' },
      data: expect.objectContaining({ playtime_minutes: 4200 }),
    })
  })

  it('does not lower a target playtime that is already the larger number', async () => {
    dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
    dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
    txMock.userEntry.findUnique.mockResolvedValue(null)
    txMock.mediaItem.findUnique
      .mockResolvedValueOnce(carriedRow({ playtime_minutes: 10 }))
      .mockResolvedValueOnce(carriedRow({ playtime_minutes: 999 }))
    txMock.achievement.count.mockResolvedValue(0)
    txMock.achievement.updateMany.mockResolvedValue({ count: 0 })

    const { POST } = await import('@/app/api/admin/merge/route')
    const res = await POST(postRequest(validBody))

    expect(res.status).toBe(200)
    expect(txMock.mediaItem.update).not.toHaveBeenCalled()
  })

  it('does not re-point achievements onto a target that already has some', async () => {
    dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
    dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
    txMock.userEntry.findUnique.mockResolvedValue(null)
    txMock.mediaItem.findUnique
      .mockResolvedValueOnce(carriedRow({ steam_app_id: 620 }))
      .mockResolvedValueOnce(carriedRow({ steam_app_id: 440 }))
    txMock.achievement.count.mockResolvedValue(17)

    const { POST } = await import('@/app/api/admin/merge/route')
    const res = await POST(postRequest(validBody))

    expect(res.status).toBe(200)
    // The source achievements go down with the source row: Achievement carries
    // @@unique([game_id, steam_api_name]), so a blind re-point would collide,
    // and reconciling two real sets is not a decision this route can make.
    expect(txMock.achievement.updateMany).not.toHaveBeenCalled()
  })

  it('never overwrites a target field that is already set', async () => {
    dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
    dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
    txMock.userEntry.findUnique.mockResolvedValue(null)
    txMock.mediaItem.findUnique
      .mockResolvedValueOnce(
        carriedRow({ steam_app_id: 620, playtime_minutes: 10 }),
      )
      .mockResolvedValueOnce(
        carriedRow({ steam_app_id: 440, playtime_minutes: 999 }),
      )
    txMock.achievement.count.mockResolvedValue(0)
    txMock.achievement.updateMany.mockResolvedValue({ count: 0 })

    const { POST } = await import('@/app/api/admin/merge/route')
    const res = await POST(postRequest(validBody))

    expect(res.status).toBe(200)
    // Every carried field is already populated on the target, so there is
    // nothing to write and the update is skipped entirely.
    expect(txMock.mediaItem.update).not.toHaveBeenCalled()
  })

  it('skips the carry entirely when the source row cannot be read', async () => {
    dbMock.mergeSuggestion.findUnique.mockResolvedValue(newSuggestion())
    dbMock.mergeSuggestion.findFirst.mockResolvedValue(null)
    txMock.userEntry.findUnique.mockResolvedValue(null)
    txMock.mediaItem.findUnique.mockResolvedValue(null)

    const { POST } = await import('@/app/api/admin/merge/route')
    const res = await POST(postRequest(validBody))

    expect(res.status).toBe(200)
    expect(txMock.achievement.count).not.toHaveBeenCalled()
    expect(txMock.mediaItem.update).not.toHaveBeenCalled()
    // The delete still runs: the merge itself is unchanged.
    expect(txMock.mediaItem.delete).toHaveBeenCalledWith({
      where: { id: 'src_1' },
    })
  })
})
