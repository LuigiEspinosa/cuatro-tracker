import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { env } from '@/lib/env'
import { YearFixtureClient } from './YearFixtureClient'

export default function YearFixturePage() {
  if (env.NODE_ENV !== 'development') {
    notFound()
  }

  return (
    <Suspense fallback={null}>
      <YearFixtureClient />
    </Suspense>
  )
}
