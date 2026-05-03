import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { env } from '@/lib/env'

const prisma = new PrismaClient()

async function main() {
  const hash = await bcrypt.hash(env.ADMIN_PASS, 12)

  await prisma.user.upsert({
    where: { email: 'admin@tracker.local' },
    update: {},
    create: {
      email: 'admin@tracker.local',
      name: 'Admin',
      password: hash,
    },
  })

  console.log('Seeded admin user: admin@tracker.local')
}

main()
  .catch((err) => {
    console.error('Seed failed: ', err)
    process.exitCode = 1
  })
  .finally(async () => {
    try {
      await prisma.$disconnect()
    } catch (err) {
      console.error('Prisma disconnect failed: ', err)
    }
  })
