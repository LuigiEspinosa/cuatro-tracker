import { NextResponse, type NextRequest } from 'next/server'
import { Prisma, WatchStatus } from '@prisma/client'
import { z } from 'zod'
import { db } from '@/lib/db'
import { findUserEntryByMediaItemId } from '@/lib/db/library'
import { logger } from '@/lib/logger'
import { withRequest } from '@/lib/request-context'
import {
  serializeProgressEntry,
  type ProgressResponse,
} from '@/lib/types/progress'

export const dynamic = 'force-dynamic'

/* `PUT /api/progress`: generic per-item UserEntry mutation endpoint.
 *
 * Reused by Stories 7.5 / 8.5 / 8.6 / 9.5 unchanged — the body's
 * `mediaItemId` carries the per-item scoping; the route is medium-agnostic.
 *
 * Partial-update semantics: only fields present in the body land in the
 * Prisma `data` object, so unset fields don't clobber persisted values.
 *
 * Story 6.5 scope reduction (2026-05-15): `user_rating` and `notes` dropped
 * from the schema. Per-medium epics can re-add when needed.
 */

const ProgressBodySchema = z.object({
  mediaItemId: z.string().min(1),
  // progress: episode / chapter / achievement count. DB CHECK enforces >= 0
  // (no upper cap — TV / games can have hundreds of episodes / achievements).
  progress: z.number().int().min(0).optional(),
  status: z.nativeEnum(WatchStatus).optional(),
  completed_at: z.string().datetime().nullable().optional(),
})

function jsonResponse(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

async function handler(req: NextRequest): Promise<NextResponse> {
  if (req.method !== 'PUT') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    logger.warn(
      { event: 'progress.bad_request', reason: 'invalid_json' },
      'progress body was not valid JSON',
    )
    return jsonResponse({ error: 'invalid_body', reason: 'invalid_json' }, 400)
  }

  const parsed = ProgressBodySchema.safeParse(rawBody)
  if (!parsed.success) {
    logger.warn(
      { event: 'progress.bad_request', issues: parsed.error.issues },
      'progress body validation failed',
    )
    return jsonResponse(
      { error: 'invalid_body', issues: parsed.error.issues },
      400,
    )
  }

  const { mediaItemId, progress, status, completed_at } = parsed.data

  const data: Prisma.UserEntryUpdateInput = {}
  const fieldsApplied: string[] = []
  if (progress !== undefined) {
    data.progress = progress
    fieldsApplied.push('progress')
  }
  if (status !== undefined) {
    data.status = status
    fieldsApplied.push('status')
  }
  if (completed_at !== undefined) {
    data.completed_at = completed_at === null ? null : new Date(completed_at)
    fieldsApplied.push('completed_at')
  }

  if (fieldsApplied.length === 0) {
    return jsonResponse({ error: 'empty_update' }, 400)
  }

  const entry = await findUserEntryByMediaItemId(mediaItemId)
  if (!entry) {
    logger.warn(
      { event: 'progress.update.not_found', mediaItemId },
      'no UserEntry for mediaItemId',
    )
    return jsonResponse({ error: 'not_in_library' }, 404)
  }

  const updated = await db.userEntry.update({
    where: { id: entry.id },
    data,
  })

  logger.info(
    { event: 'progress.update.ok', mediaItemId, fieldsApplied },
    'UserEntry updated',
  )

  const body: ProgressResponse = serializeProgressEntry(updated)
  return jsonResponse(body, 200)
}

export const PUT = withRequest<NextRequest, NextResponse>(handler)
