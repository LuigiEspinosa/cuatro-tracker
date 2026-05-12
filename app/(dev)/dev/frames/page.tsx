import { notFound } from 'next/navigation'
import { FramedCover, MEDIA, MEDIUMS, SIZES } from '@/components/molecules/FramedCover'
import type { Medium } from '@/components/molecules/FramedCover'
import { env } from '@/lib/env'

/* Visual fixture for Story 2.6 (FramedCover atom).
 * Dev-only route. Renders the 5×4 grid Cuatro reviews against the bundle's
 * Cuatro Tracker Frames.html prototype side-by-side. Production build excludes
 * this route via the NODE_ENV gate (notFound() triggers a static 404 page in
 * production; only the dev server renders the fixture).
 */

export default function FramesFixturePage() {
  if (env.NODE_ENV !== 'development') {
    notFound()
  }

  return (
    <main className='min-h-screen bg-[var(--ground-base)] py-16 px-12 text-[var(--phosphor-cream)]'>
      <header className='mx-auto mb-12 max-w-[1440px]'>
        <p className='m-0 mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
          Phase 0 · Frames asset family
        </p>
        <h1 className='m-0 mb-3 font-serif text-[52px] font-semibold italic leading-[1.05]'>
          Cuatro Tracker · FramedCover
        </h1>
        <p className='m-0 max-w-[720px] text-[17px] leading-[1.4] text-[var(--phosphor-cream-dim)]'>
          Five per-medium chromes × three sizes plus the ≤48px collapsed state. Dev-only fixture. Hover or keyboard-focus any cell to ramp the per-medium glow.
        </p>
      </header>
      <div
        className='mx-auto grid max-w-[1440px] items-end justify-start gap-x-8 gap-y-16'
        style={{ gridTemplateColumns: '160px 88px 240px 544px 56px' }}
      >
        <ColumnHeader />
        {MEDIUMS.map((medium) => (
          <Row key={medium} medium={medium} />
        ))}
      </div>
    </main>
  )
}

function ColumnHeader() {
  return (
    <>
      <span />
      <ColLabel>thumb</ColLabel>
      <ColLabel>card</ColLabel>
      <ColLabel>hero</ColLabel>
      <ColLabel>≤48px</ColLabel>
    </>
  )
}

function ColLabel({ children }: { children: string }) {
  return (
    <span className='font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
      {children}
    </span>
  )
}

function Row({ medium }: { medium: Medium }) {
  const cfg = MEDIA[medium]
  const placeholder = medium === 'games' ? '/dev/cover-placeholder-3x4.svg' : '/dev/cover-placeholder-2x3.svg'
  return (
    <>
      <RowLabel name={cfg.name} chrome={cfg.chrome} />
      {SIZES.map((size) => (
        <Cell key={`${medium}-${size}`}>
          <button
            type='button'
            className='cursor-pointer border-0 bg-transparent p-0'
            aria-label={`${cfg.name} ${cfg.chrome} at ${size} size, focus to ramp glow`}
          >
            <FramedCover medium={medium} size={size} src={placeholder} alt={`${cfg.name} placeholder cover`} />
          </button>
        </Cell>
      ))}
      <Cell>
        <button
          type='button'
          className='cursor-pointer border-0 bg-transparent p-0'
          style={{ width: 32 }}
          aria-label={`${cfg.name} ${cfg.chrome} collapsed at 32px width, focus to ramp glow`}
        >
          <FramedCover medium={medium} size='thumb' src={placeholder} alt={`${cfg.name} placeholder cover`} />
        </button>
      </Cell>
    </>
  )
}

function RowLabel({ name, chrome }: { name: string; chrome: string }) {
  return (
    <div className='flex flex-col gap-1'>
      <span className='font-serif text-[22px] font-semibold italic text-[var(--phosphor-cream)]'>{name}</span>
      <span className='font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--phosphor-cream-dim)]'>{chrome}</span>
    </div>
  )
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className='flex items-end justify-start'>{children}</div>
}
