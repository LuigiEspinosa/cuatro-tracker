'use client'

import { useCallback, useMemo, useState } from 'react'
import { useChannelFlipNavigate } from '@/components/molecules/ChannelFlipTransition'

type Mode = 'animated-slow' | 'animated-default' | 'reduced-forced' | 'os-setting'

const SLOW_TOTAL_MS = 3000

const MODES: { key: Mode; label: string; description: string }[] = [
  {
    key: 'animated-slow',
    label: 'Animation (forced non-reduced, 3000ms)',
    description: `Forces non-reduced and slows the transition to ${SLOW_TOTAL_MS}ms so each phase lasts 1s (band sweep 1s, hold black 1s, fade back 1s).`,
  },
  {
    key: 'animated-default',
    label: 'Animation (forced non-reduced, 600ms default)',
    description: 'Forces non-reduced at the canonical 600ms total (200/200/200 phases).',
  },
  {
    key: 'reduced-forced',
    label: 'Reduced-motion (forced)',
    description: 'Bypasses matchMedia; instant route change with no overlay.',
  },
  {
    key: 'os-setting',
    label: 'OS setting (no override)',
    description: 'Honors the actual matchMedia value. If your OS has reduced-motion ON, this is an instant route change; if OFF, plays at the default 600ms cadence.',
  },
]

export function FlipFixtureClient() {
  const [mode, setMode] = useState<Mode>('animated-slow')
  const [completedAt, setCompletedAt] = useState<number | null>(null)
  const [runCount, setRunCount] = useState(0)

  const hookOptions = useMemo(() => {
    switch (mode) {
      case 'animated-slow':
        return { reducedMotionOverride: false, totalDuration: SLOW_TOTAL_MS }
      case 'animated-default':
        return { reducedMotionOverride: false }
      case 'reduced-forced':
        return { reducedMotionOverride: true }
      case 'os-setting':
      default:
        return {}
    }
  }, [mode])

  const { navigate, overlay } = useChannelFlipNavigate(hookOptions)

  const playInPlace = useCallback(async () => {
    setCompletedAt(null)
    setRunCount((n) => n + 1)
    const start = performance.now()
    await navigate('/dev/flip')
    setCompletedAt(performance.now() - start)
  }, [navigate])

  const navigateToBoot = useCallback(async () => {
    setCompletedAt(null)
    setRunCount((n) => n + 1)
    await navigate('/dev/boot')
  }, [navigate])

  return (
    <main className='min-h-screen bg-[var(--ground-base)] text-[var(--phosphor-cream)]'>
      <header className='mx-auto max-w-[1200px] px-12 pt-16'>
        <p className='m-0 mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
          Story 2.8 · ChannelFlipTransition wrapper
        </p>
        <h1 className='m-0 mb-3 font-serif text-[44px] font-semibold italic leading-[1.05]'>
          Cuatro Tracker · ChannelFlipTransition
        </h1>
        <p className='m-0 mb-2 font-mono text-[13px] leading-[1.55] text-[var(--phosphor-cream-dim)]'>
          Dev-only fixture. Pick a mode, click the Play-in-place button to watch the band sweep over a sample frame. The Real-navigate button exercises the full programmatic-navigate path against another dev fixture (/dev/boot).
        </p>
      </header>

      <section className='mx-auto mt-10 max-w-[1200px] px-12'>
        <div className='flex flex-wrap gap-3'>
          {MODES.map((m) => {
            const active = mode === m.key
            return (
              <button
                key={m.key}
                type='button'
                onClick={() => setMode(m.key)}
                aria-pressed={active}
                className={`rounded-none border-2 px-4 py-2 font-mono text-[12px] uppercase tracking-[0.14em] transition-colors ${
                  active
                    ? 'border-[var(--phosphor-cream)] bg-[var(--phosphor-cream)] text-[var(--ground-base)]'
                    : 'border-[var(--phosphor-cream-dim)] bg-transparent text-[var(--phosphor-cream-dim)] hover:border-[var(--phosphor-cream)] hover:text-[var(--phosphor-cream)]'
                }`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
        <p className='mt-3 font-mono text-[12px] text-[var(--phosphor-cream-dim)]'>
          {MODES.find((m) => m.key === mode)?.description}
        </p>
      </section>

      <section className='mx-auto mt-10 max-w-[1200px] px-12'>
        <div className='flex flex-wrap gap-3'>
          <button
            type='button'
            onClick={playInPlace}
            className='rounded-none border-2 border-[var(--phosphor-cream)] bg-transparent px-5 py-3 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--phosphor-cream)] hover:bg-[var(--phosphor-cream)] hover:text-[var(--ground-base)]'
          >
            Play in place (navigate to this same page)
          </button>
          <button
            type='button'
            onClick={navigateToBoot}
            className='rounded-none border-2 border-[var(--phosphor-cream-dim)] bg-transparent px-5 py-3 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--phosphor-cream-dim)] hover:border-[var(--phosphor-cream)] hover:text-[var(--phosphor-cream)]'
          >
            Real navigate to /dev/boot
          </button>
        </div>
        <p className='mt-3 font-mono text-[12px] text-[var(--phosphor-cream-dim)]'>
          run #{runCount + 1} · {completedAt !== null ? `complete @ ${Math.round(completedAt)}ms` : 'idle'}
        </p>
      </section>

      <section className='mx-auto mt-10 max-w-[1200px] px-12 pb-16'>
        <div className='relative mx-auto aspect-[4/3] w-full max-w-[720px] overflow-hidden border-2 border-[var(--phosphor-cream-dim)] bg-[var(--ground-card)]'>
          <div className='absolute inset-0 grid place-items-center'>
            <div className='text-center'>
              <p className='m-0 font-serif text-[32px] italic text-[var(--phosphor-cream)]'>
                Sample chrome behind the flip
              </p>
              <p className='m-0 mt-2 font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
                Watch the phosphor band sweep over this surface
              </p>
            </div>
          </div>
        </div>
      </section>

      {overlay}
    </main>
  )
}
