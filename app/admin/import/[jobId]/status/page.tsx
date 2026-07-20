import { ImportStatusClient } from './ImportStatusClient'

export const metadata = {
  title: 'IMPORT STATUS · Cuatro Tracker',
}

export default async function ImportStatusPage({
  params,
}: {
  params: Promise<{ jobId: string }>
}) {
  const { jobId } = await params

  return (
    <main className='imp-page'>
      <a href='#imp-main' className='imp-skip'>
        Skip to import status
      </a>
      <p className='imp-eyebrow'>ADMIN · BULK IMPORT</p>
      <h1 id='imp-main' className='imp-title'>
        IMPORT STATUS
      </h1>
      <ImportStatusClient jobId={jobId} />
    </main>
  )
}
