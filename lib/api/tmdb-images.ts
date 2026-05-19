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

// Recognises http://, https://, HTTP://, HTTPS:// (case-insensitive per
// RFC 3986 §3.1 which allows mixed-case schemes). Anchored at the start of
// the string so a path like '/http_thing.jpg' is correctly rejected.
const ABSOLUTE_URL_RE = /^https?:\/\//i

export function getImageUrl(
  path: string | null,
  size: TmdbImageSize,
): string | null {
  // Empty string is treated as "no image" the same way null is. Without this,
  // a normaliser that ever wrote `''` would yield `https://image.tmdb.org/t/p/w185`
  // (the bucket root, a 404 image request).
  if (path === null || path.length === 0) return null
  // AniList cover URLs (and any future absolute-URL source) come through as
  // full https://... strings; they must not be re-prefixed with the TMDB CDN
  // base. Story 8.4 OI #2: extend the existing helper instead of introducing
  // a new getCoverUrl(path, source) so every call site benefits automatically.
  if (ABSOLUTE_URL_RE.test(path)) return path
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}
