import { ImportWizardClient } from './ImportWizardClient'

export const metadata = {
  title: 'BULK IMPORT · Cuatro Tracker',
}

export default function ImportPage() {
  return (
    <main className='imp-page'>
      <a href='#imp-main' className='imp-skip'>
        Skip to import wizard
      </a>
      <p className='imp-eyebrow'>ADMIN · BULK IMPORT</p>
      <h1 id='imp-main' className='imp-title'>
        BULK IMPORT
      </h1>
      <ImportWizardClient />
    </main>
  )
}
