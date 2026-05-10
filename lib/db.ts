import { PrismaClient } from '@prisma/client'
import { closeRedis } from '@/lib/redis'
import { logger } from '@/lib/logger'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma ?? new PrismaClient()

// The NODE_ENV guard targets Vercel serverless where globalThis
// does not persist between invocations. This project runs on a long-lived VPS
// process - caching in production is correct and avoids new instances on hot paths.
globalForPrisma.prisma = db

let shutdownStarted = false

async function gracefulShutdown(signal: string) {
  if (shutdownStarted) return
  shutdownStarted = true
  logger.info(
    { event: 'shutdown.start', signal },
    'graceful shutdown starting',
  )
  try {
    await db.$disconnect()
    await closeRedis()
    logger.info({ event: 'shutdown.complete' }, 'graceful shutdown complete')
    process.exit(0)
  } catch (err) {
    logger.error({ event: 'shutdown.error', err }, 'graceful shutdown failed')
    process.exit(1)
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
