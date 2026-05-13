import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { env } from '@/lib/env'
import { BootFixtureClient } from './BootFixtureClient'

/* Visual fixture for Story 2.7 (BootSequence molecule).
 * Dev-only route. Renders four mounts of BootSequence (default, no-welcome,
 * reduced-motion forced, reduced-motion OS-current) with a replay key bump per
 * AC-1/2/3 verification. Production build excludes this route via the NODE_ENV
 * gate; notFound() triggers a static 404. */

export default function BootFixturePage() {
  if (env.NODE_ENV !== 'development') {
    notFound()
  }

  return (
    <Suspense fallback={null}>
      <BootFixtureClient />
    </Suspense>
  )
}
