import type { Job } from 'bullmq'
import { refreshIgdbToken } from '@/lib/api/igdb'
import { logger } from '@/lib/logger'

export const IGDB_TOKEN_REFRESH_QUEUE = 'igdbTokenRefresh'

export async function igdbTokenRefreshProcessor(
  _job: Job,
): Promise<{ expiresAt: number }> {
  const { expiresAt } = await refreshIgdbToken()
  logger.info(
    {
      event: 'job.refresh.complete',
      queue: IGDB_TOKEN_REFRESH_QUEUE,
      expiresAt,
    },
    'igdb token refresh complete',
  )
  return { expiresAt }
}
