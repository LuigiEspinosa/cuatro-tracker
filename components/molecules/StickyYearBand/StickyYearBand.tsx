'use client'

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useRef, useState, type CSSProperties } from 'react'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'

export type StickyYearBandSize = 64 | 80 | 96

export type StickyYearBandProps = {
  year: number
  month?: number
  size?: StickyYearBandSize
  reducedMotionOverride?: boolean
  fadeDurationMs?: number
}

const DEFAULT_FADE_MS = 250

const MONTH_ABBREVS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const

function monthLabel(month?: number): string | null {
  if (typeof month !== 'number') return null
  if (!Number.isInteger(month)) return null
  if (month < 1 || month > 12) return null
  return MONTH_ABBREVS[month - 1]
}

function safeFadeMs(ms?: number): number {
  if (typeof ms !== 'number') return DEFAULT_FADE_MS
  if (!Number.isFinite(ms)) return DEFAULT_FADE_MS
  if (ms < 0) return DEFAULT_FADE_MS
  return ms
}

export function StickyYearBand({
  year,
  month,
  size = 80,
  reducedMotionOverride,
  fadeDurationMs,
}: StickyYearBandProps) {
  const reduced = useReducedMotion(reducedMotionOverride)
  const [displayedYear, setDisplayedYear] = useState(year)
  const [outgoingYear, setOutgoingYear] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const fadeMs = safeFadeMs(fadeDurationMs)

  if (Number.isFinite(year) && year !== displayedYear) {
    setDisplayedYear(year)
    if (reduced) {
      if (outgoingYear !== null) setOutgoingYear(null)
    } else if (outgoingYear === null) {
      setOutgoingYear(displayedYear)
    } else if (outgoingYear === year) {
      setOutgoingYear(null)
    } else {
      setOutgoingYear(displayedYear)
    }
  }

  useGSAP(
    () => {
      if (outgoingYear === null) return
      const incoming = containerRef.current?.querySelector<HTMLElement>(
        '[data-syb-layer="incoming"]',
      )
      const outgoing = containerRef.current?.querySelector<HTMLElement>(
        '[data-syb-layer="outgoing"]',
      )
      if (reduced) {
        if (outgoing) gsap.set(outgoing, { clearProps: 'opacity' })
        setOutgoingYear(null)
        return
      }
      if (!incoming || !outgoing) return

      const duration = fadeMs / 1000
      gsap.set(incoming, { opacity: 0 })
      gsap.set(outgoing, { opacity: 1 })

      const tl = gsap.timeline({
        onComplete: () => setOutgoingYear(null),
      })
      tl.to(incoming, { opacity: 1, duration, ease: 'none' }, 0)
      tl.to(outgoing, { opacity: 0, duration, ease: 'none' }, 0)
    },
    { scope: containerRef, dependencies: [outgoingYear, reduced, fadeMs] },
  )

  const monthAbbrev = monthLabel(month)
  const fontSize = `${size}px`
  const stackStyle: CSSProperties = { minHeight: fontSize }

  return (
    <div ref={containerRef} className='syb' role='banner'>
      <div className='syb-year-stack' style={stackStyle}>
        {outgoingYear !== null ? (
          <span
            className='syb-year syb-year-outgoing'
            data-syb-layer='outgoing'
            style={{ fontSize }}
            aria-hidden='true'
          >
            {outgoingYear}
          </span>
        ) : null}
        <span
          className='syb-year syb-year-incoming'
          data-syb-layer='incoming'
          style={{ fontSize }}
          aria-live='polite'
        >
          {displayedYear}
        </span>
      </div>
      {monthAbbrev ? <div className='syb-month'>{monthAbbrev}</div> : null}
      <div className='syb-rule' aria-hidden='true'>
        <span className='syb-rule-band' style={{ background: 'var(--rb-green)' }} />
        <span className='syb-rule-band' style={{ background: 'var(--rb-yellow)' }} />
        <span className='syb-rule-band' style={{ background: 'var(--rb-orange)' }} />
        <span className='syb-rule-band' style={{ background: 'var(--rb-pink)' }} />
        <span className='syb-rule-band' style={{ background: 'var(--rb-purple)' }} />
        <span className='syb-rule-band' style={{ background: 'var(--rb-blue)' }} />
      </div>
    </div>
  )
}
