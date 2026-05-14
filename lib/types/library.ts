import type { MediaType, WatchStatus } from '@prisma/client'

/* Library item shape returned by `/api/library` and consumed by:
 *  - CurrentlyActiveCarousel (Story 5.3) for the WATCHING-status rotator
 *  - HorizontalCoverScroller (Story 5.4) for Recently Added / Recently Released
 *  - LibraryCard (Epic 6+) for the per-medium library grids
 *  - GlobalSearch (Story 5.4 follow-up) for the inLibrary chip flip
 *
 * Server-side-formatted fields (progressLabel, progressPct) precompute the
 * per-medium display strings so the client renders without an N+1 lookup.
 */
export type LibraryItem = {
  id: string // UserEntry.id
  mediaItemId: string // MediaItem.id (for navigation to detail pages)
  mediaType: MediaType
  status: WatchStatus
  title: string
  posterPath: string | null // TMDB-style path; client constructs the full URL
  year: number | null // derived from MediaItem.release_date
  releaseDate: string | null // ISO; null when MediaItem.release_date is sentinel-1970
  progressLabel: string | null // e.g. "S2 EP4 / 10" or "42% WATCHED" — null for movies + when no progress data exists
  progressPct: number | null // 0-100, for inline phosphor progress bar visualization
  sourceLabel: string | null // e.g. "From TMDB" — for hero source-description line
  createdAt: string // ISO, UserEntry.created_at
  updatedAt: string // ISO, UserEntry.updated_at
}

export type LibraryListResponse = {
  items: LibraryItem[]
}
