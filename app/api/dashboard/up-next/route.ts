import { NextResponse, type NextRequest } from 'next/server'
import { withRequest } from '@/lib/request-context'
import type { LibraryItem } from '@/lib/types/library'

export const dynamic = 'force-dynamic'

/* `/api/dashboard/up-next`: returns the user's "next thing to consume" per
 * medium. For Epic 5 the only addable medium is movies (TMDB, Epic 4); movies
 * have no next-episode / next-chapter / near-completion-achievement semantics,
 * so the band is intentionally empty until TV / anime / manga / games become
 * addable in Epic 7+.
 *
 * The endpoint shape is stabilised now so the client subscription is fixed and
 * future stories grow the SQL without touching app/page.tsx.
 *
 * TODO(epic 7+): join UserEntry → MediaItem.children to surface:
 *  - TV: next unwatched episode for WATCHING shows (resolved via progress
 *    cursor on the child MediaItem rows).
 *  - Anime: same shape as TV.
 *  - Manga: next unread chapter for in-progress series.
 *  - Games: near-completion achievement (≥80% of an achievement set).
 */

type UpNextResponse = { items: LibraryItem[] }

async function handler(_req: NextRequest): Promise<NextResponse> {
  const body: UpNextResponse = { items: [] }
  return NextResponse.json(body, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export const GET = withRequest<NextRequest, NextResponse>(handler)
