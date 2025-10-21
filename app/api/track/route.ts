import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { ensureMovieCached } from '@/lib/movies'

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
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

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