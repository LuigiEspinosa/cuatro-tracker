import type { Job } from 'bullmq'
import { MediaType } from '@prisma/client'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { logger } from '@/lib/logger'
import {
  SteamApiError,
  getPlayerAchievements,
  getSchemaForGame,
} from '@/lib/api/steam'

export const STEAM_ACHIEVEMENT_SYNC_QUEUE = 'steamAchievementSync'

export type SteamAchievementSyncTotals = {
  ok: number
  private_profile: number
  failed: number
  processed: number
}

// Mark a game as `failed` defensively: if THIS DB write itself fails (transient
// connection blip), we want to log and keep iterating the remaining games
// rather than aborting the whole batch with the original API error masked
// under a DB error (Bundle A code-review finding).
async function safeMarkStatus(
  gameId: string,
  status: 'ok' | 'private_profile' | 'failed',
): Promise<void> {
  try {
    await db.mediaItem.update({
      where: { id: gameId },
      data: { achievement_sync_status: status },
    })
  } catch (statusErr) {
    logger.error(
      {
        event: 'job.sync.status_update_failed',
        queue: STEAM_ACHIEVEMENT_SYNC_QUEUE,
        gameId,
        status,
        err: statusErr,
      },
      'steam sync: status update failed',
    )
  }
}

export async function steamAchievementSyncProcessor(
  _job: Job,
): Promise<{ totals: SteamAchievementSyncTotals }> {
  const games = await db.mediaItem.findMany({
    where: { type: MediaType.GAME, steam_id: { not: null } },
    select: { id: true, steam_id: true },
  })

  const totals: SteamAchievementSyncTotals = {
    ok: 0,
    private_profile: 0,
    failed: 0,
    processed: 0,
  }

  for (const game of games) {
    if (game.steam_id === null) continue
    totals.processed += 1
    const appId = String(game.steam_id)

    try {
      const result = await getPlayerAchievements(env.STEAM_USER_ID, appId)
      if (result.status === 'private_profile') {
        logger.warn(
          {
            event: 'job.sync.private_profile',
            queue: STEAM_ACHIEVEMENT_SYNC_QUEUE,
            gameId: game.id,
            appId,
          },
          'steam sync: private profile',
        )
        await safeMarkStatus(game.id, 'private_profile')
        totals.private_profile += 1
        continue
      }

      // Schema fetch is best-effort: a transient 4xx/5xx here shouldn't
      // discard the player-achievement data we already paid to fetch.
      // Falls back to an empty map; upsert uses `steam_api_name` as the
      // display name in that case (Bundle A code-review finding).
      let schemaByName: Map<string, { displayName: string; description?: string | null; icon: string }> = new Map()
      try {
        const schema = await getSchemaForGame(appId)
        schemaByName = new Map(schema.map((s) => [s.name, s]))
      } catch (schemaErr) {
        logger.warn(
          {
            event: 'job.sync.schema_fetch_failed',
            queue: STEAM_ACHIEVEMENT_SYNC_QUEUE,
            gameId: game.id,
            appId,
            err: schemaErr,
          },
          'steam sync: schema fetch failed, falling back to api-name display',
        )
      }

      // Wrap each game's achievement upserts + status update in a single
      // transaction so a Postgres connection blip mid-loop cannot leave the
      // DB with half the achievements at the new state and the rest stale
      // while still flipping `achievement_sync_status` to 'ok'
      // (Bundle A code-review finding).
      const upserts = result.achievements.map((ach) => {
        const meta = schemaByName.get(ach.steam_api_name)
        return db.achievement.upsert({
          where: {
            game_id_steam_api_name: {
              game_id: game.id,
              steam_api_name: ach.steam_api_name,
            },
          },
          create: {
            game_id: game.id,
            steam_api_name: ach.steam_api_name,
            display_name: meta?.displayName ?? ach.steam_api_name,
            description: meta?.description ?? null,
            icon_url: meta?.icon ?? null,
            unlocked: ach.unlocked,
            unlocked_at: ach.unlocked_at,
          },
          update: {
            display_name: meta?.displayName ?? ach.steam_api_name,
            description: meta?.description ?? null,
            icon_url: meta?.icon ?? null,
            unlocked: ach.unlocked,
            unlocked_at: ach.unlocked_at,
          },
        })
      })
      const statusUpdate = db.mediaItem.update({
        where: { id: game.id },
        data: { achievement_sync_status: 'ok' },
      })
      await db.$transaction([...upserts, statusUpdate])

      logger.info(
        {
          event: 'job.sync.game_ok',
          queue: STEAM_ACHIEVEMENT_SYNC_QUEUE,
          gameId: game.id,
          appId,
          achievementCount: result.achievements.length,
        },
        'steam sync: game ok',
      )
      totals.ok += 1
    } catch (err) {
      const httpStatus =
        err instanceof SteamApiError ? err.httpStatus : undefined
      logger.error(
        {
          event: 'job.sync.failed',
          queue: STEAM_ACHIEVEMENT_SYNC_QUEUE,
          gameId: game.id,
          appId,
          httpStatus,
          err,
        },
        'steam sync: game failed',
      )
      await safeMarkStatus(game.id, 'failed')
      totals.failed += 1
    }
  }

  logger.info(
    {
      event: 'job.sync.complete',
      queue: STEAM_ACHIEVEMENT_SYNC_QUEUE,
      totals,
    },
    'steam sync complete',
  )

  return { totals }
}
