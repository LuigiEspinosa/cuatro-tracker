import { z } from 'zod'

/* Pure URL-construction helper for TMDB image CDN paths. Lives in its own
 * module so client components (e.g. SearchResultRow) can import it WITHOUT
 * pulling in `lib/api/tmdb.ts`'s adapter dependencies (env, logger, pino,
 * sonic-boom → fs) — that chain breaks the browser bundle.
 *
 * `lib/api/tmdb.ts` re-exports these names so existing server-side callers
 * (route handlers, future BullMQ jobs) keep working unchanged.
 */

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'

export const TmdbImageSizeSchema = z.enum([
  'w92',
  'w154',
  'w185',
  'w342',
  'w500',
  'w780',
  'original',
])
export type TmdbImageSize = z.infer<typeof TmdbImageSizeSchema>

export function getImageUrl(
  path: string | null,
  size: TmdbImageSize,
): string | null {
  if (path === null) return null
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}
