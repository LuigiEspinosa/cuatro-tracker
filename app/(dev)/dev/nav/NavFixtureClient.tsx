'use client'

import { useSession } from 'next-auth/react'

export function NavFixtureClient() {
  const { data: session, status } = useSession()

  return (
    <main className='min-h-[60vh] bg-[var(--ground-base)] text-[var(--phosphor-cream)]'>
      <header className='mx-auto max-w-[1200px] px-12 pt-12'>
        <p className='m-0 mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
          Story 2.11 · MainNav organism
        </p>
        <h1 className='m-0 mb-3 font-serif text-[44px] font-semibold italic leading-[1.05]'>
          Cuatro Tracker · MainNav
        </h1>
        <p className='m-0 mb-2 font-mono text-[13px] leading-[1.55] text-[var(--phosphor-cream-dim)]'>
          Dev-only fixture. The MainNav above this content renders directly from the root layout. Click a nav button and watch the channel-flip play, then the route changes per Story 2.8.
        </p>
        <p className='m-0 font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
          session status: {status} · user: {session?.user?.email ?? '—'}
        </p>
      </header>

      <section className='mx-auto mt-10 grid max-w-[1200px] grid-cols-2 gap-6 px-12 pb-16'>
        {['Timeline', 'Library', 'Search', 'Admin'].map((label, i) => (
          <div
            key={label}
            className='border-2 border-[var(--phosphor-cream-dim)] bg-[var(--ground-card)] p-8'
            style={{
              borderTopColor: ['var(--rb-green)', 'var(--rb-yellow)', 'var(--rb-orange)', 'var(--rb-pink)'][i],
              borderTopWidth: '4px',
            }}
          >
            <p className='m-0 font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
              target panel
            </p>
            <p className='m-0 mt-2 font-serif text-[28px] italic'>{label}</p>
            <p className='m-0 mt-2 font-mono text-[11px] text-[var(--phosphor-cream-ghost)]'>
              Route: /{label.toLowerCase()}
            </p>
          </div>
        ))}
      </section>
    </main>
  )
}
