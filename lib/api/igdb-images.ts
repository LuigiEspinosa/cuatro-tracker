/* Pure URL-construction helper for IGDB image CDN paths. Lives in its own
 * module so client components (e.g. GameCard, GameDetail) can import it
 * WITHOUT pulling in `lib/api/igdb.ts`'s adapter dependencies (env, logger,
 * pino, sonic-boom -> fs, ioredis) - that chain breaks the browser bundle.
 *
 * Sizes are a plain TypeScript union (not a Zod enum) to keep the client
 * bundle slim; `lib/api/tmdb-images.ts` uses Zod because TMDB's runtime
 * parsing surface lives in the same module. IGDB has no equivalent need.
 */

export const IGDB_IMAGE_BASE = 'https://images.igdb.com/igdb/image/upload'

export type IgdbImageSize =
  | 't_thumb'
  | 't_cover_small'
  | 't_cover_big'
  | 't_screenshot_med'
  | 't_1080p'

// Empty `imageId` is treated as a programmer error: the constructed URL still
// carries the trailing `.jpg` (yielding a 404 from IGDB). Story 9.4's call
// sites guard at the source rather than this helper - matching the
// conservative posture of `lib/api/tmdb-images.ts` which guards null/empty at
// the path layer, not the size layer.
export function getGameImageUrl(imageId: string, size: IgdbImageSize): string {
  return `${IGDB_IMAGE_BASE}/${size}/${imageId}.jpg`
}
