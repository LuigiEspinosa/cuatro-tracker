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
    totals.processed += 1
    if (game.steam_id === null) continue
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
        await db.mediaItem.update({
          where: { id: game.id },
          data: { achievement_sync_status: 'private_profile' },
        })
        totals.private_profile += 1
        continue
      }

      const schema = await getSchemaForGame(appId)
      const schemaByName = new Map(schema.map((s) => [s.name, s]))

      for (const ach of result.achievements) {
        const meta = schemaByName.get(ach.steam_api_name)
        await db.achievement.upsert({
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
            unlocked: ach.unlocked_at !== null,
            unlocked_at: ach.unlocked_at,
          },
          update: {
            display_name: meta?.displayName ?? ach.steam_api_name,
            description: meta?.description ?? null,
            icon_url: meta?.icon ?? null,
            unlocked: ach.unlocked_at !== null,
            unlocked_at: ach.unlocked_at,
          },
        })
      }

      await db.mediaItem.update({
        where: { id: game.id },
        data: { achievement_sync_status: 'ok' },
      })

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
      await db.mediaItem.update({
        where: { id: game.id },
        data: { achievement_sync_status: 'failed' },
      })
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
