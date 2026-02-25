import { PrismaClient } from "@prisma/client";
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash(process.env.ADMIN_PASS ?? 'changeme', 12);

  await prisma.user.upsert({
    where: { email: 'admin@tracker.local' },
    update: {},
    create: {
      email: 'admin@tracker.local',
      name: 'Admin',
      password: hash,
    },
  });

  console.log('Seeded admin user: admin@tracker.local');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
