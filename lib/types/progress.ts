import type { UserEntry, WatchStatus } from '@prisma/client'

/* Progress mutation wire shape, returned by `PUT /api/progress` and reused
 * by Stories 7.5 / 8.5 / 8.6 / 9.5 unchanged.
 *
 * camelCase wire shape; the snake_case DB shape stays internal.
 */
export type ProgressResponse = {
  id: string
  mediaItemId: string
  status: WatchStatus
  userRating: number | null
  progress: number
  notes: string | null
  completedAt: string | null
  startedAt: string | null
  updatedAt: string
}

export function serializeProgressEntry(entry: UserEntry): ProgressResponse {
  return {
    id: entry.id,
    mediaItemId: entry.media_item_id,
    status: entry.status,
    userRating: entry.user_rating,
    progress: entry.progress,
    notes: entry.notes,
    completedAt: entry.completed_at ? entry.completed_at.toISOString() : null,
    startedAt: entry.started_at ? entry.started_at.toISOString() : null,
    updatedAt: entry.updated_at.toISOString(),
  }
}
