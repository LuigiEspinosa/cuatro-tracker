import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { MergeReviewClient } from './MergeReviewClient'
import { MergeEmptyState } from './MergeEmptyState'
import { MergeErrorState } from './MergeErrorState'
import { serializeSuggestion } from './merge-view'

export const dynamic = 'force-dynamic'

export const metadata = {
  // Middot separator, not a hyphen-dash: CLAUDE.md bans em-dashes / double-dashes
  // everywhere including metadata.title, matching Story 11.3's 'ADMIN · ...'.
  title: 'MERGE TOOL · Cuatro Tracker',
}

/* /admin/merge (Story 11.4). Mounts inside app/admin/layout.tsx (the scanline
 * ground + session gate). Reads the pending MergeSuggestion rows fresh on every
 * request (force-dynamic, no cache) and hands a Prisma-free, display-ready
 * payload to the client review surface. */
export default async function MergePage() {
  let content

  try {
    const suggestions = await db.mergeSuggestion.findMany({
      where: { resolved: false },
      orderBy: { confidence: 'desc' },
      include: { source: true, target: true },
    })
    content =
      suggestions.length === 0 ? (
        <MergeEmptyState />
      ) : (
        <MergeReviewClient suggestions={suggestions.map(serializeSuggestion)} />
      )
  } catch (err) {
    logger.error(
      { event: 'admin.merge.page.load_failed', err },
      'failed to load pending merge suggestions',
    )
    content = <MergeErrorState />
  }

  return (
    <>
      {/* Jumps past MainNav (rendered by the root layout) to the review area. */}
      <a className='merge-skip' href='#merge-main'>
        SKIP TO MERGE REVIEW
      </a>
      <main className='merge-page' id='merge-main'>
        <p className='merge-eyebrow'>Admin · /admin/merge</p>
        {content}
      </main>
    </>
  )
}
