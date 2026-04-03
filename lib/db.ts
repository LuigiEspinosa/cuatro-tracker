import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const db = globalForPrisma.prisma ?? new PrismaClient()

// The NODE_ENV guard targets Vercel serverless where globalThis
// does not persist between invocations. This project runs on a long-lived VPS
// process - caching in production is correct and avoids new instances on hot paths.
globalForPrisma.prisma = db
