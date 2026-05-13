'use client'

import { useCallback, useMemo, useState } from 'react'
import { StickyYearBand } from '@/components/molecules/StickyYearBand'

type Mode = 'animated-slow' | 'animated-default' | 'reduced-forced' | 'os-setting'

const SLOW_FADE_MS = 2000
const YEAR_START = 1985
const YEAR_END = 2026

const MODES: { key: Mode; label: string; description: string }[] = [
  {
    key: 'animated-slow',
    label: `Animation (forced non-reduced, ${SLOW_FADE_MS}ms fade)`,
    description: `Forces non-reduced and slows the cross-fade to ${SLOW_FADE_MS}ms so each year transition is visible end-to-end.`,
  },
  {
    key: 'animated-default',
    label: 'Animation (forced non-reduced, 250ms default)',
    description: 'Forces non-reduced at the canonical 250ms cross-fade.',
  },
  {
    key: 'reduced-forced',
    label: 'Reduced-motion (forced)',
    description: 'Bypasses matchMedia. Year swap is instant; no outgoing layer mounts.',
  },
  {
    key: 'os-setting',
    label: 'OS setting (no override)',
    description: 'Honors the actual matchMedia value. If your OS has reduced-motion ON, this is an instant swap; if OFF, plays at 250ms.',
  },
]

function wrap(value: number, min: number, max: number): number {
  const span = max - min + 1
  return ((((value - min) % span) + span) % span) + min
}

export function YearFixtureClient() {
  const [mode, setMode] = useState<Mode>('animated-slow')
  const [year, setYear] = useState<number>(YEAR_START)
  const [month, setMonth] = useState<number | undefined>(undefined)

  const props = useMemo(() => {
    switch (mode) {
      case 'animated-slow':
        return { reducedMotionOverride: false, fadeDurationMs: SLOW_FADE_MS }
      case 'animated-default':
        return { reducedMotionOverride: false }
      case 'reduced-forced':
        return { reducedMotionOverride: true }
      case 'os-setting':
      default:
        return {}
    }
  }, [mode])

  const nextYear = useCallback(() => {
    setYear((y) => wrap(y + 1, YEAR_START, YEAR_END))
  }, [])

  const prevYear = useCallback(() => {
    setYear((y) => wrap(y - 1, YEAR_START, YEAR_END))
  }, [])

  const toggleMonth = useCallback(() => {
    setMonth((m) => {
      if (m === undefined) return 1
      if (m >= 12) return undefined
      return m + 1
    })
  }, [])

  return (
    <main className='min-h-screen bg-[var(--ground-base)] text-[var(--phosphor-cream)]'>
      <header className='mx-auto max-w-[1200px] px-12 pt-16'>
        <p className='m-0 mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
          Story 2.10 · StickyYearBand molecule
        </p>
        <h1 className='m-0 mb-3 font-serif text-[44px] font-semibold italic leading-[1.05]'>
          Cuatro Tracker · StickyYearBand
        </h1>
        <p className='m-0 mb-2 font-mono text-[13px] leading-[1.55] text-[var(--phosphor-cream-dim)]'>
          Dev-only fixture. Pick a mode, then click Next year or Previous year to drive the prop change. The band sticks to the top of the viewport while the filler below it scrolls.
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

      <section className='mx-auto mt-6 max-w-[1200px] px-12'>
        <div className='flex flex-wrap gap-3'>
          <button
            type='button'
            onClick={prevYear}
            className='rounded-none border-2 border-[var(--phosphor-cream)] bg-transparent px-5 py-3 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--phosphor-cream)] hover:bg-[var(--phosphor-cream)] hover:text-[var(--ground-base)]'
          >
            Previous year
          </button>
          <button
            type='button'
            onClick={nextYear}
            className='rounded-none border-2 border-[var(--phosphor-cream)] bg-transparent px-5 py-3 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--phosphor-cream)] hover:bg-[var(--phosphor-cream)] hover:text-[var(--ground-base)]'
          >
            Next year
          </button>
          <button
            type='button'
            onClick={toggleMonth}
            className='rounded-none border-2 border-[var(--phosphor-cream-dim)] bg-transparent px-5 py-3 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--phosphor-cream-dim)] hover:border-[var(--phosphor-cream)] hover:text-[var(--phosphor-cream)]'
          >
            Cycle month
          </button>
        </div>
        <p className='mt-3 font-mono text-[12px] text-[var(--phosphor-cream-dim)]'>
          year: {year} · month: {month ?? '(hidden)'}
        </p>
      </section>

      <StickyYearBand
        year={year}
        month={month}
        size={80}
        reducedMotionOverride={props.reducedMotionOverride}
        fadeDurationMs={props.fadeDurationMs}
      />

      <section className='mx-auto max-w-[1200px] px-12 pb-32'>
        {Array.from({ length: 18 }).map((_, i) => (
          <p
            key={i}
            className='mt-6 font-serif text-[20px] leading-[1.5] text-[var(--phosphor-cream-dim)]'
          >
            Filler paragraph #{i + 1}. Scroll the viewport to verify the band stays pinned to the top while this content slides underneath. The sticky binding is `position: sticky; top: 0;` on the `.syb` element; the parent timeline (Story 10.4) owns the actual scroll container.
          </p>
        ))}
      </section>
    </main>
  )
}
