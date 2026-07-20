import { BitmapText } from '@/components/atoms/BitmapText'

/* The "no candidates" state (Story 11.4 AC-7). A shared presentational
 * component (no 'use client', no server-only imports) so both the RSC page and
 * the client review surface can render it when the queue empties. Copy is
 * locked verbatim by the AC. Bespoke markup reusing BitmapText directly rather
 * than the shared EmptyStateCard, which prepends "> " and has no matching tone
 * (OI #6). */
export function MergeEmptyState() {
  return (
    <div className='merge-state' role='status'>
      <BitmapText size={30} tone='cream' glow>
        NO CANDIDATES
      </BitmapText>
      <BitmapText size={22} tone='cream-dim'>
        NOTHING TO MERGE
      </BitmapText>
      <p className='merge-state-sub'>
        Run a bulk import or wait for the next scheduled scan.
      </p>
    </div>
  )
}
