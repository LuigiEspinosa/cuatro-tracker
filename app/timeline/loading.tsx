import { TimelineSkeleton } from './TimelineSkeleton'

// Route-level loading UI shown while the page Server Component fetches the
// timeline dataset. Mirrors the design bundle's skeleton-row state.
export default function TimelineLoading() {
  return (
    <main className='timeline-page'>
      <TimelineSkeleton />
    </main>
  )
}
