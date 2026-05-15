import type { UserEntry, WatchStatus } from '@prisma/client'

/* Progress mutation wire shape, returned by `PUT /api/progress` and reused
 * by Stories 7.5 / 8.5 / 8.6 / 9.5 unchanged.
 *
 * camelCase wire shape; the snake_case DB shape stays internal.
 *
 * Rating + notes were dropped from Story 6.5 scope per Cuatro 2026-05-15. The
 * UserEntry columns still exist (Prisma schema unchanged) so per-medium epics
 * can opt back in by extending the route's Zod schema; the serializer remains
 * silent on those fields.
 */
export type ProgressResponse = {
  id: string
  mediaItemId: string
  status: WatchStatus
  progress: number
  completedAt: string | null
  startedAt: string | null
  updatedAt: string
}

export function serializeProgressEntry(entry: UserEntry): ProgressResponse {
  return {
    id: entry.id,
    mediaItemId: entry.media_item_id,
    status: entry.status,
    progress: entry.progress,
    completedAt: entry.completed_at ? entry.completed_at.toISOString() : null,
    startedAt: entry.started_at ? entry.started_at.toISOString() : null,
    updatedAt: entry.updated_at.toISOString(),
  }
}
