import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { env } from '@/lib/env'
import { FlipFixtureClient } from './FlipFixtureClient'

export default function FlipFixturePage() {
  if (env.NODE_ENV !== 'development') {
    notFound()
  }

  return (
    <Suspense fallback={null}>
      <FlipFixtureClient />
    </Suspense>
  )
}
