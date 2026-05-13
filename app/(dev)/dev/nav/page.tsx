import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { env } from '@/lib/env'
import { NavFixtureClient } from './NavFixtureClient'

export default function NavFixturePage() {
  if (env.NODE_ENV !== 'development') {
    notFound()
  }

  return (
    <Suspense fallback={null}>
      <NavFixtureClient />
    </Suspense>
  )
}
