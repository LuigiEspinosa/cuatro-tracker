import Link from 'next/link'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'ADMIN · Cuatro Tracker',
}

export default async function AdminPage() {
  const pendingCount = await db.mergeSuggestion.count({
    where: { resolved: false },
  })
  const mergeLabel = `${pendingCount} PENDING ${pendingCount === 1 ? 'SUGGESTION' : 'SUGGESTIONS'}`

  // * Static, unlike the live merge count above. Story 11.5 creates the
  // * bulkImport queue; lib/jobs/queues.ts registers only igdbTokenRefresh and
  // * steamAchievementSync today, so there is no job state to read. Importing
  // * that registry here would build its Queue instances and open Redis
  // * connections from the Next.js server process, the documented
  // * BullMQ-in-a-Server-Component footgun. Replace this literal when 11.5
  // * lands rather than supplementing it.
  const importLabel = 'NO ACTIVE IMPORTS'

  return (
    <main className='adm-dash'>
      <h1 className='adm-dash-title'>ADMIN</h1>
      <div className='adm-tiles'>
        <Link href='/admin/merge' className='adm-tile'>
          <span className='adm-tile-label'>MERGE TOOL</span>
          <span className='adm-tile-sub'>{mergeLabel}</span>
        </Link>
        <Link href='/admin/import' className='adm-tile'>
          <span className='adm-tile-label'>BULK IMPORT WIZARD</span>
          <span className='adm-tile-sub'>{importLabel}</span>
        </Link>
      </div>
    </main>
  )
}
