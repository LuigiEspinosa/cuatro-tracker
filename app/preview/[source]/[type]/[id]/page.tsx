import { notFound } from 'next/navigation'
import Link from 'next/link'
import { MediaType } from '@prisma/client'
import { z } from 'zod'
import { getMovie, getTv, getImageUrl, TmdbApiError } from '@/lib/api/tmdb'
import {
  getMedia,
  AnilistApiError,
  AnilistNotFoundError,
} from '@/lib/api/anilist'
import { logger } from '@/lib/logger'
import { AddToLibraryButton } from './AddToLibraryButton'

export const dynamic = 'force-dynamic'

type Medium = 'movies' | 'tv' | 'anime' | 'manga'

const ParamsSchema = z.object({
  source: z.enum(['tmdb', 'anilist']),
  type: z.enum(['movie', 'tv', 'anime', 'manga']),
  id: z.coerce.number().int().positive(),
})

type Params = z.infer<typeof ParamsSchema>

const TYPE_TO_MEDIA_TYPE: Record<Params['type'], MediaType> = {
  movie: MediaType.MOVIE,
  tv: MediaType.TV_SHOW,
  anime: MediaType.ANIME,
  manga: MediaType.MANGA,
}

const TYPE_TO_MEDIUM: Record<Params['type'], Medium> = {
  movie: 'movies',
  tv: 'tv',
  anime: 'anime',
  manga: 'manga',
}

const TYPE_LABEL: Record<Params['type'], string> = {
  movie: 'MOVIE',
  tv: 'TV',
  anime: 'ANIME',
  manga: 'MANGA',
}

type PreviewData = {
  title: string
  originalTitle: string | null
  year: number | null
  overview: string | null
  posterUrl: string | null
}

// AniList descriptions ship raw HTML even with `asHtml: false`. Same helper
// as the anime detail page — mirror so legacy + future flows render uniformly.
function stripAnilistHtml(text: string): string {
  return text
    .replace(/<br\s*\/?\s*>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
}

function extractYear(date: string | null | undefined): number | null {
  if (!date) return null
  const match = /^(\d{4})/.exec(date)
  return match ? Number.parseInt(match[1], 10) : null
}

async function loadPreview(
  source: Params['source'],
  type: Params['type'],
  id: number,
): Promise<PreviewData | null> {
  try {
    if (source === 'tmdb' && type === 'movie') {
      const movie = await getMovie(id)
      return {
        title: movie.title,
        originalTitle: movie.original_title ?? null,
        year: extractYear(movie.release_date),
        overview: movie.overview ?? null,
        posterUrl: getImageUrl(movie.poster_path, 'w780'),
      }
    }
    if (source === 'tmdb' && type === 'tv') {
      const tv = await getTv(id)
      return {
        title: tv.name,
        originalTitle: tv.original_name ?? null,
        year: extractYear(tv.first_air_date),
        overview: tv.overview ?? null,
        posterUrl: getImageUrl(tv.poster_path, 'w780'),
      }
    }
    if (source === 'anilist' && (type === 'anime' || type === 'manga')) {
      const anilistType = type === 'anime' ? 'ANIME' : 'MANGA'
      const media = await getMedia(id, anilistType)
      const title =
        media.title.userPreferred ??
        media.title.romaji ??
        media.title.english ??
        media.title.native ??
        'Untitled'
      const native = media.title.native ?? null
      const year = media.startDate.year
      const poster =
        media.coverImage?.extraLarge ??
        media.coverImage?.large ??
        media.coverImage?.medium ??
        null
      return {
        title,
        originalTitle: native !== title ? native : null,
        year,
        overview: media.description ? stripAnilistHtml(media.description) : null,
        posterUrl: poster,
      }
    }
    return null
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
      return null
    }
    throw err
  }
}

function isValidSourceTypeCombo(
  source: Params['source'],
  type: Params['type'],
): boolean {
  // tmdb supports movie + tv; anilist supports anime + manga. Other combos
  // (e.g. tmdb + anime) aren't wired and 404 immediately.
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
  const data = await loadPreview(parsed.data.source, parsed.data.type, parsed.data.id)
  if (!data) return { title: 'PREVIEW NOT FOUND · Cuatro Tracker' }
  return { title: `${data.title.toUpperCase()} · PREVIEW · Cuatro Tracker` }
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

  const data = await loadPreview(source, type, id)
  if (!data) notFound()

  const mediaType = TYPE_TO_MEDIA_TYPE[type]
  const medium = TYPE_TO_MEDIUM[type]
  const synopsisParagraphs = (data.overview ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  return (
    <main className='preview-page'>
      <Link href='/search' className='preview-back-link'>
        &lt; BACK TO SEARCH
      </Link>
      <section className='preview-hero'>
        <div className='preview-hero-cover'>
          {data.posterUrl ? (
            // Plain <img> rather than next/image — the AniList URLs aren't
            // listed in next.config.images.remotePatterns, and next/image is
            // overkill for an ephemeral preview page.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.posterUrl}
              alt={data.title}
              className='preview-hero-poster'
            />
          ) : (
            <div className='preview-hero-poster-fallback'>?</div>
          )}
        </div>
        <div className='preview-hero-text'>
          <p className='preview-hero-medium'>{TYPE_LABEL[type]} · PREVIEW</p>
          <h1 className='preview-hero-title'>{data.title}</h1>
          {data.originalTitle ? (
            <p className='preview-hero-original-title'>{data.originalTitle}</p>
          ) : null}
          {data.year !== null ? (
            <p className='preview-hero-meta'>{data.year}</p>
          ) : null}
          <AddToLibraryButton
            source={source}
            sourceId={id}
            type={mediaType}
            medium={medium}
          />
          <p className='preview-hero-source'>
            Source: {source.toUpperCase()} · ID {id}
          </p>
        </div>
      </section>
      {synopsisParagraphs.length > 0 ? (
        <article className='preview-synopsis'>
          {synopsisParagraphs.map((para, idx) => (
            <p key={idx}>{para}</p>
          ))}
        </article>
      ) : null}
    </main>
  )
}
