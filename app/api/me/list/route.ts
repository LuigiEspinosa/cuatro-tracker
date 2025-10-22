import { authConfig } from '@/lib/auth';
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth';

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? undefined;
  const sort = searchParams.get("sort") || "updated";
  const dir = (searchParams.get('dir') || 'desc') as 'asc' | 'desc';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));

  const orderBy = sort === 'release' ?
    { movie: { releaseDate: dir } }
    : sort === 'popularity'
      ? { movie: { popularity: dir } }
      : { updatedAt: dir }

  const where: any = { userId: (session.user as any).id }
  if (status) where.status = status

  const [total, items] = await prisma.$transaction([
    prisma.userMovie.count({ where }),
    prisma.userMovie.findMany({ where, include: { movie: true }, orderBy, skip: (page - 1) * pageSize, take: pageSize })
  ])

  return Response.json(items)
}