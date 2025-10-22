import { authConfig } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { ensureMovieCached } from '@/lib/movies'
import { getServerSession } from 'next-auth'

export const runtime = 'nodejs'

const Body = z.object({
  movie: z.object({
    id: z.number(),
    title: z.string(),
    release_date: z.string().optional(),
    poster_path: z.string().optional(),
    backdrop_path: z.string().optional(),
    popularity: z.number().optional()
  }),
  status: z.enum(['WATCHLIST', 'WATCHING', 'COMPLETED', 'DROPPED']),
  rating: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(500).optional(),
})

export async function POST(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = Body.parse(await req.json())
  await ensureMovieCached(body.movie)

  const rec = await prisma.userMovie.upsert({
    where: { userId_tmdbId: { userId: (session.user as any).id, tmdbId: body.movie.id } },
    update: { status: body.status, rating: body.rating, notes: body.notes },
    create: { userId: (session.user as any).id, tmdbId: body.movie.id, status: body.status, rating: body.rating, notes: body.notes },
    include: { movie: true },
  })

  return Response.json(rec)
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authConfig);
  if (!session?.user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tmdbId = Number(searchParams.get('tmdbId'))
  if (!tmdbId) return Response.json({ error: 'tmdbId required' }, { status: 400 })


  await prisma.userMovie.delete({ where: { userId_tmdbId: { userId: (session.user as any).id, tmdbId } } }).catch(() => { })
  return Response.json({ ok: true })
}
