import { notFound } from 'next/navigation'
import { z } from 'zod'
import { TmdbApiError } from '@/lib/api/tmdb'
import { AnilistApiError, AnilistNotFoundError } from '@/lib/api/anilist'
import { logger } from '@/lib/logger'
import { MoviePreview } from './MoviePreview'
import { TvPreview } from './TvPreview'
import { AnimePreview } from './AnimePreview'
import { MangaPreview } from './MangaPreview'

export const dynamic = 'force-dynamic'

const ParamsSchema = z.object({
  source: z.enum(['tmdb', 'anilist']),
  type: z.enum(['movie', 'tv', 'anime', 'manga']),
  id: z.coerce.number().int().positive(),
})

function isValidSourceTypeCombo(
  source: 'tmdb' | 'anilist',
  type: 'movie' | 'tv' | 'anime' | 'manga',
): boolean {
  if (source === 'tmdb') return type === 'movie' || type === 'tv'
  if (source === 'anilist') return type === 'anime' || type === 'manga'
  return false
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ source: string; type: string; id: string }>
}): Promise<{ title: string }> {
  const raw = await params
  const parsed = ParamsSchema.safeParse(raw)
  if (!parsed.success) return { title: 'PREVIEW · Cuatro Tracker' }
  return {
    title: `PREVIEW · ${parsed.data.type.toUpperCase()} · Cuatro Tracker`,
  }
}

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ source: string; type: string; id: string }>
}) {
  const raw = await params
  const parsed = ParamsSchema.safeParse(raw)
  if (!parsed.success) notFound()
  const { source, type, id } = parsed.data
  if (!isValidSourceTypeCombo(source, type)) notFound()

  try {
    if (source === 'tmdb' && type === 'movie') {
      return await MoviePreview({ id })
    }
    if (source === 'tmdb' && type === 'tv') {
      return await TvPreview({ id })
    }
    if (source === 'anilist' && type === 'anime') {
      return await AnimePreview({ id })
    }
    if (source === 'anilist' && type === 'manga') {
      return await MangaPreview({ id })
    }
  } catch (err) {
    if (
      err instanceof TmdbApiError ||
      err instanceof AnilistApiError ||
      err instanceof AnilistNotFoundError
    ) {
      logger.warn(
        { event: 'preview.upstream_failed', source, type, id, err },
        'preview upstream fetch failed; rendering 404',
      )
      notFound()
    }
    throw err
  }
  notFound()
}
