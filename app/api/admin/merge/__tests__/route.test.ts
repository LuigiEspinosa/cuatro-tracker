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
    updateMany: vi.fn(),
    delete: vi.fn(),
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
})
