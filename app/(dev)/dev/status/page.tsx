import { notFound } from 'next/navigation'
import { env } from '@/lib/env'
import { PhosphorLED, type PhosphorLEDStatus } from '@/components/atoms/PhosphorLED'
import { PhosphorBar } from '@/components/atoms/PhosphorBar'

const STATUSES: { status: PhosphorLEDStatus; label: string }[] = [
  { status: 'completed', label: 'Completed' },
  { status: 'in-progress', label: 'In progress' },
  { status: 'backlog', label: 'In backlog' },
  { status: 'dropped', label: 'Dropped' },
  { status: 'on-hold', label: 'On hold' },
]

const SIZES = [8, 12, 16] as const

const BAR_SAMPLES: { value: number; max: number; label: string }[] = [
  { value: 0, max: 100, label: '0% progress' },
  { value: 25, max: 100, label: '25% progress' },
  { value: 50, max: 100, label: '50% progress' },
  { value: 75, max: 100, label: '75% progress' },
  { value: 100, max: 100, label: '100% progress' },
  { value: -10, max: 100, label: 'value < 0 clamps to 0' },
  { value: 200, max: 100, label: 'value > max clamps to max' },
  { value: 10, max: 0, label: 'max = 0 renders empty' },
  { value: 3, max: 12, label: 'chapters read' },
]

export default function StatusFixturePage() {
  if (env.NODE_ENV !== 'development') {
    notFound()
  }

  return (
    <main className='min-h-screen bg-[var(--ground-base)] text-[var(--phosphor-cream)]'>
      <header className='mx-auto max-w-[1200px] px-12 pt-16'>
        <p className='m-0 mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
          Story 2.9 · PhosphorLED + PhosphorBar atoms
        </p>
        <h1 className='m-0 mb-3 font-serif text-[44px] font-semibold italic leading-[1.05]'>
          Cuatro Tracker · Status atoms
        </h1>
        <p className='m-0 mb-2 font-mono text-[13px] leading-[1.55] text-[var(--phosphor-cream-dim)]'>
          Dev-only fixture. Hover any LED or bar to verify the tooltip; tab through the sample row to verify keyboard a11y.
        </p>
      </header>

      <section className='mx-auto mt-10 max-w-[1200px] px-12'>
        <h2 className='m-0 mb-4 font-mono text-[14px] uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
          PhosphorLED · 5 statuses × 3 sizes
        </h2>
        <div className='grid grid-cols-[120px_repeat(3,_120px)] items-center gap-x-8 gap-y-4'>
          <span aria-hidden='true' />
          {SIZES.map((s) => (
            <span
              key={s}
              className='font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--phosphor-cream-dim)]'
            >
              size={s}px
            </span>
          ))}
          {STATUSES.map(({ status, label }) => (
            <div key={status} className='contents'>
              <span className='font-mono text-[12px] uppercase tracking-[0.14em]'>{status}</span>
              {SIZES.map((size) => (
                <span key={size} className='flex items-center'>
                  <PhosphorLED status={status} size={size} label={label} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className='mx-auto mt-12 max-w-[1200px] px-12'>
        <h2 className='m-0 mb-4 font-mono text-[14px] uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
          PhosphorBar · 9 samples
        </h2>
        <div className='flex flex-col gap-4'>
          {BAR_SAMPLES.map((sample, index) => (
            <div key={index} className='flex items-center gap-6'>
              <span className='w-[260px] font-mono text-[12px] text-[var(--phosphor-cream-dim)]'>
                {sample.label}
              </span>
              <div className='flex-1'>
                <PhosphorBar value={sample.value} max={sample.max} label={sample.label} />
              </div>
              <span className='w-[100px] text-right font-mono text-[11px] text-[var(--phosphor-cream-ghost)]'>
                {sample.value} / {sample.max}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className='mx-auto mt-12 max-w-[1200px] px-12 pb-16'>
        <h2 className='m-0 mb-4 font-mono text-[14px] uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
          Sample row composition (AC-3)
        </h2>
        <ul className='m-0 list-none p-0'>
          {[
            { status: 'completed' as const, title: 'Episode 1 · Cold Open', meta: '23 min · 2024' },
            { status: 'in-progress' as const, title: 'Episode 2 · Reverberations', meta: '24 min · 2024' },
            { status: 'backlog' as const, title: 'Episode 3 · Spectra', meta: '24 min · 2024' },
            { status: 'on-hold' as const, title: 'Episode 4 · Glass Lake', meta: '22 min · 2024' },
            { status: 'dropped' as const, title: 'Episode 5 · Echo Park', meta: '25 min · 2024' },
          ].map((row, index) => (
            <li
              key={row.title}
              tabIndex={0}
              className={`flex items-center gap-4 border-b border-[var(--phosphor-cream-ghost)] px-3 py-3 focus:outline focus:outline-2 focus:outline-[var(--phosphor-cream)] focus:outline-offset-[-2px] ${
                index % 2 === 0 ? 'bg-[var(--ground-row-even)]' : 'bg-[var(--ground-row-odd)]'
              }`}
            >
              <PhosphorLED status={row.status} size={10} label={`${row.status} status`} />
              <span className='flex-1 font-serif text-[16px]'>{row.title}</span>
              <span className='font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--phosphor-cream-dim)]'>
                {row.meta}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
