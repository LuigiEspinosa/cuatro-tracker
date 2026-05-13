'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { BootSequence } from '@/components/molecules/BootSequence'

type Mode = 'default' | 'no-welcome' | 'reduced-forced' | 'reduced-os'

const FIXTURE_TOTAL_DURATION_MS = 4000

const MODES: { key: Mode; label: string; description: string }[] = [
  {
    key: 'default',
    label: 'Animation (full timeline + welcome)',
    description: `Forces non-reduced and slows the timeline to ${FIXTURE_TOTAL_DURATION_MS}ms so each frame is observable. Welcome flash at the end. onComplete fires at the end of frame 10.`,
  },
  {
    key: 'no-welcome',
    label: 'Animation (no welcome)',
    description: `Forces non-reduced and slows the timeline to ${FIXTURE_TOTAL_DURATION_MS}ms. Stops at frame 9 (READY.) with no welcome flash. onComplete fires at the end of frame 9.`,
  },
  {
    key: 'reduced-forced',
    label: 'Reduced-motion (forced)',
    description: 'Bypasses matchMedia; renders static READY. and fires onComplete on first paint.',
  },
  {
    key: 'reduced-os',
    label: 'OS setting (no override)',
    description: 'Honors the actual matchMedia value. If your OS has reduced-motion ON, this matches mode 3; if OFF, plays the full animation at the default 1200ms cadence.',
  },
]

export function BootFixtureClient() {
  const search = useSearchParams()
  const urlReduced = search?.get('reduced') === 'true'
  const [mode, setMode] = useState<Mode>(urlReduced ? 'reduced-forced' : 'default')
  const [runCount, setRunCount] = useState(0)
  const [completedAt, setCompletedAt] = useState<number | null>(null)

  useEffect(() => {
    setMode(urlReduced ? 'reduced-forced' : 'default')
  }, [urlReduced])

  const replay = useCallback((next: Mode) => {
    setCompletedAt(null)
    setMode(next)
    setRunCount((n) => n + 1)
  }, [])

  const onComplete = useCallback(() => {
    setCompletedAt(performance.now())
  }, [])

  const props = useMemo(() => {
    switch (mode) {
      case 'default':
        return {
          showWelcome: true,
          onComplete,
          reducedMotionOverride: false,
          totalDuration: FIXTURE_TOTAL_DURATION_MS,
        }
      case 'no-welcome':
        return {
          showWelcome: false,
          onComplete,
          reducedMotionOverride: false,
          totalDuration: FIXTURE_TOTAL_DURATION_MS,
        }
      case 'reduced-forced':
        return { showWelcome: true, onComplete, reducedMotionOverride: true }
      case 'reduced-os':
      default:
        return { showWelcome: true, onComplete }
    }
  }, [mode, onComplete])

  return (
    <main className='min-h-screen bg-[var(--ground-base)] text-[var(--phosphor-cream)]'>
      <header className='mx-auto max-w-[1200px] px-12 pt-16'>
        <p className='m-0 mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
          Story 2.7 · BootSequence molecule
        </p>
        <h1 className='m-0 mb-3 font-serif text-[44px] font-semibold italic leading-[1.05]'>
          Cuatro Tracker · BootSequence
        </h1>
        <p className='m-0 mb-2 font-mono text-[13px] leading-[1.55] text-[var(--phosphor-cream-dim)]'>
          Dev-only fixture. Pick a mode, watch the 10-frame timeline. Press any key during playback to verify the keyboard-skip path. Toggle OS reduced-motion in system settings to verify the matchMedia branch.
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
                onClick={() => replay(m.key)}
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

      <section className='mx-auto mt-10 max-w-[1200px] px-12 pb-16'>
        <div className='relative mx-auto aspect-[4/3] w-full max-w-[720px] overflow-hidden border-2 border-[var(--phosphor-cream-dim)] bg-[var(--ground-base)]'>
          <BootSequence key={`${mode}-${runCount}`} {...props} />
          <div className='pointer-events-none absolute left-3 top-3 z-10 font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
            run #{runCount + 1} · {completedAt !== null ? `complete @ ${Math.round(completedAt)}ms` : 'in progress'}
          </div>
        </div>
      </section>
    </main>
  )
}
