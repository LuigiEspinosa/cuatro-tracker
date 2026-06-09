import { NextResponse, type NextRequest } from 'next/server'
import { withRequest } from '@/lib/request-context'
import type { LibraryItem } from '@/lib/types/library'

export const dynamic = 'force-dynamic'

/* `/api/dashboard/up-next`: returns the user's "next thing to consume" per
 * medium. The band is empty only while NO addable medium has child-progress
 * semantics. That code-level condition is the real activation trigger, not an
 * epic number.
 *
 * ! ACTIVATION CONDITION IS NOW TRUE (since Epic 8). The original stub was keyed
 * ! to "Epic 7+"; TV (Epic 7), anime + manga (Epic 8), and games (Epic 9) have
 * ! all shipped, so every input this band needs now lives in the schema. This is
 * ! therefore an OVERDUE stub, not a forward-looking one: it still returns an
 * ! empty array even though the data to populate it is live. See deferred-work.md
 * ! ("Up Next child-record join"); wire it (or promote to a story) before any
 * ! surface relies on this band.
 *
 * The endpoint shape is stable, so wiring the join changes only this handler
 * body, never app/page.tsx or the client subscription.
 *
 * TODO(up-next-join): join each WATCHING / in-progress UserEntry to its child
 * MediaItem rows via the progress cursor and surface, per medium:
 *  - TV / Anime: next unwatched episode.
 *  - Manga: next unread chapter.
 *  - Games: near-completion achievement (>=80% of an achievement set).
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
