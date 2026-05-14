import { useId, type ReactNode } from 'react'

export type SectionBandProps = {
  title: string
  count?: number | null
  children: ReactNode
  className?: string
}

const RAINBOW_BANDS = [
  'var(--rb-green)',
  'var(--rb-yellow)',
  'var(--rb-orange)',
  'var(--rb-pink)',
  'var(--rb-purple)',
  'var(--rb-blue)',
]

export function SectionBand({
  title,
  count = null,
  children,
  className,
}: SectionBandProps) {
  const reactId = useId()
  const headingId = `section-band-${reactId}`
  const cls = className ? `dsec ${className}` : 'dsec'
  const showCount = typeof count === 'number' && Number.isFinite(count)
  return (
    <section className={cls} aria-labelledby={headingId}>
      <div className='dsec-head'>
        <h2 id={headingId} className='dsec-title'>{title}</h2>
        {showCount ? (
          <span className='dsec-count'>
            {count} {count === 1 ? 'item' : 'items'}
          </span>
        ) : null}
      </div>
      <span className='dsec-rule' aria-hidden='true'>
        {RAINBOW_BANDS.map((color, i) => (
          <span
            key={i}
            className='dsec-rule-band'
            style={{ background: color }}
          />
        ))}
      </span>
      <div className='dsec-body'>{children}</div>
    </section>
  )
}
