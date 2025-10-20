import { prisma } from './prisma'
import type { TMDBMovie } from './tmdb'


export async function ensureMovieCached(m: TMDBMovie) {
  return prisma.movie.upsert({
    where: { tmdbId: m.id },
    update: {
      title: m.title,
      releaseDate: m.release_date ? new Date(m.release_date) : null,
      posterPath: m.poster_path ?? null,
      backdropPath: m.backdrop_path ?? null,
      popularity: m.popularity ?? null,
    },
    create: {
      tmdbId: m.id,
      title: m.title,
      releaseDate: m.release_date ? new Date(m.release_date) : null,
      posterPath: m.poster_path ?? null,
      backdropPath: m.backdrop_path ?? null,
      popularity: m.popularity ?? null,
    },
  })
}