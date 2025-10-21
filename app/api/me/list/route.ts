import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') ?? undefined
  const sort = searchParams.get('sort') || 'updated'

  const orderBy = sort === 'release' ?
    { movie: { releaseDate: 'desc' as const } }
    : sort === 'popularity'
      ? { movie: { popularity: 'desc' as const } }
      : { updatedAt: 'desc' as const }

  const where: any = { userId: (session.user as any).id }
  if (status) where.status = status

  const items = await prisma.userMovie.findMany({ where, include: { movie: true }, orderBy })
  return Response.json(items)
}