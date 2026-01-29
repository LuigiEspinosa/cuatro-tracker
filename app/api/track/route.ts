import { authConfig } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { ensureMovieCached } from '@/lib/movies'
import { getServerSession } from 'next-auth'
import { TMDBMovie } from '@/lib/tmdb'

export const runtime = 'nodejs'

const MovieSchema = z.object({
  id: z.number(),
  title: z.string(),
  release_date: z.string().nullable().optional(),
  poster_path: z.string().nullable().optional(),
  backdrop_path: z.string().nullable().optional(),
  popularity: z.number().nullable().optional(),
})

const Body = z.object({
  movie: MovieSchema,
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

  const movie: TMDBMovie = {
    id: body.movie.id,
    title: body.movie.title,
    release_date: body.movie.release_date ?? undefined,
    poster_path: body.movie.poster_path ?? undefined,
    backdrop_path: body.movie.backdrop_path ?? undefined,
    popularity: body.movie.popularity ?? undefined,
  }

  await ensureMovieCached(movie)

  const userId = (session.user as any).id
  const rec = await prisma.userMovie.upsert({
    where: { userId_tmdbId: { userId, tmdbId: body.movie.id } },
    update: {
      status: body.status,
      rating: body.rating ?? undefined,
      notes: body.notes ?? undefined,
    },
    create: {
      userId,
      tmdbId: body.movie.id,
      status: body.status,
      rating: body.rating ?? undefined,
      notes: body.notes ?? undefined,
    },
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


  const userId = (session.user as any).id
  await prisma.userMovie
    .delete({ where: { userId_tmdbId: { userId, tmdbId } } })
    .catch(() => { })

  return Response.json({ ok: true })
}
