import { Suspense } from 'react'
import { findTimelineEntries, serializeLibraryItem } from '@/lib/db/library'
import { TimelineView } from '@/components/organisms/TimelineView'
import { TimelineSkeleton } from './TimelineSkeleton'

// Force-dynamic: the timeline is per-request user data, not statically cacheable.
// The Suspense boundary below satisfies useSearchParams (inside useTimelineUrlSync)
// on this dynamic route, the explicit Story 10.3 deferral this story discharges.
export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'TIMELINE · Cuatro Tracker',
}

export default async function TimelinePage() {
  const entries = await findTimelineEntries()
  const initialItems = entries.map(serializeLibraryItem)

  return (
    <main className='timeline-page'>
      <Suspense fallback={<TimelineSkeleton />}>
        <TimelineView initialItems={initialItems} />
      </Suspense>
    </main>
  )
}
