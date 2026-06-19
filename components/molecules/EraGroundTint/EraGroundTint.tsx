'use client'

// Client molecule: writes the --ground-base CSS variable from scroll position
// (GSAP ScrollTrigger, smooth path) or from the active year (reduced-motion
// path). Both read and mutate the live DOM, so this cannot be a Server
// Component. It renders null: a pure side-effect driver mounted inside
// TimelineView, never visible UI.

import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect } from 'react'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'
import { eraTokenForYear } from '@/lib/timeline'

// Register once at module load. registerPlugin is idempotent, so a Fast Refresh
// re-import will not double-register. Story 10.5 is the repo's first
// ScrollTrigger consumer.
gsap.registerPlugin(ScrollTrigger)

export type EraGroundTintGroup = { year: number | null }

export type EraGroundTintProps = {
  // The ordered year groups TimelineView already derived. Drives which decade
  // boundaries exist and the starting era; only `year` is read.
  groups: readonly EraGroundTintGroup[]
  // The year at the band line (TimelineView's IntersectionObserver result),
  // used for the reduced-motion hard jump. Null only for an all-undated list.
  activeYear: number | null
  // Read-only handle to TimelineView's root, scoping the [data-tl-year] lookup.
  // Structural (not RefObject) so a div ref widens cleanly to HTMLElement.
  containerRef: { readonly current: HTMLElement | null }
  reducedMotionOverride?: boolean
}

const GROUND_BASE = '--ground-base'
// AC-2: a 200-300px ramp centered on each decade boundary.
const RAMP_PX = 250
// Fallback band-line inset when the sticky band is not measurable yet.
const DEFAULT_BAND_PX = 120
const HEX6 = /^#[0-9a-fA-F]{6}$/

function setGroundBase(value: string): void {
  document.documentElement.style.setProperty(GROUND_BASE, value)
}

function resetGroundBase(): void {
  // Drop the inline override so the token falls back to its tokens.css default
  // (--color-ground-base): leaving /timeline never strands a tinted root.
  document.documentElement.style.removeProperty(GROUND_BASE)
}

function eraVarRef(year: number): string {
  return `var(${eraTokenForYear(year)})`
}

function resolveEraHex(year: number): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(eraTokenForYear(year))
    .trim()
  return HEX6.test(raw) ? raw : ''
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

function toHex2(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
}

function lerpHex(from: string, to: string, t: number): string {
  const [r1, g1, b1] = channels(from)
  const [r2, g2, b2] = channels(to)
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  return `#${toHex2(r1 + (r2 - r1) * k)}${toHex2(g1 + (g2 - g1) * k)}${toHex2(b1 + (b2 - b1) * k)}`
}

function firstDatedYear(groups: readonly EraGroundTintGroup[]): number | null {
  for (const group of groups) {
    if (group.year !== null) return group.year
  }
  return null
}

export function EraGroundTint({
  groups,
  activeYear,
  containerRef,
  reducedMotionOverride,
}: EraGroundTintProps) {
  const reduced = useReducedMotion(reducedMotionOverride)

  // Smooth path: one scrubbed ScrollTrigger per decade boundary, each ramping
  // --ground-base from the outgoing era hex to the incoming one across RAMP_PX.
  // Under reduced motion this whole block is skipped (the effect below owns it).
  useGSAP(
    () => {
      if (reduced) return
      const root = containerRef.current
      if (root === null) return

      // * Failure mode: useGSAP reverts the tweens and triggers on re-run and
      // * unmount, but NOT the raw --ground-base writes (the tween animates a
      // * plain proxy, the CSS var is a side effect). Without clearing first, a
      // * re-run whose new groups has no dated head (a Story 10.6 filter or sort
      // * that empties the timeline) would strand the previous tint. Reset, then
      // * re-establish from the dated head below.
      resetGroundBase()

      // Start at the top group's era so the ground matches before any scroll. A
      // var() reference always resolves, even where hex sampling is unavailable.
      const topYear = firstDatedYear(groups)
      if (topYear !== null) setGroundBase(eraVarRef(topYear))

      const bandEl = root.querySelector<HTMLElement>('.syb')
      const bandLine = bandEl
        ? Math.round(bandEl.getBoundingClientRect().height)
        : DEFAULT_BAND_PX

      for (let i = 1; i < groups.length; i += 1) {
        const fromYear = groups[i - 1].year
        const toYear = groups[i].year
        if (fromYear === null || toYear === null) continue
        const fromToken = eraTokenForYear(fromYear)
        const toToken = eraTokenForYear(toYear)
        // Same era on both sides is not a boundary (1965 and 1975 are both
        // pre-1980). Only an era change earns a ramp.
        if (fromToken === toToken) continue
        const sentinel = root.querySelector<HTMLElement>(
          `[data-tl-year="${toYear}"]`,
        )
        if (sentinel === null) continue
        const fromHex = resolveEraHex(fromYear)
        const toHex = resolveEraHex(toYear)
        // jsdom (and any engine that will not surface the computed hex) yields
        // empty strings: skip rather than write a broken value.
        if (fromHex === '' || toHex === '') continue

        const proxy = { t: 0 }
        gsap.to(proxy, {
          t: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: sentinel,
            // Center the RAMP_PX band on the sentinel crossing the band line.
            start: `top ${bandLine + RAMP_PX / 2}px`,
            // Clamp to 0 so a short band line (height < RAMP_PX / 2) cannot push
            // the end above the scroller top, where the final boundary's sentinel
            // may be unreachable and the ramp tail would never complete.
            end: `top ${Math.max(0, bandLine - RAMP_PX / 2)}px`,
            scrub: true,
          },
          // * Failure mode: Lenis runs its own rAF loop and does not call
          // * ScrollTrigger.update(), so on a Lenis-smoothed route the scrub can
          // * lag the wheel. Verified-first in the browser smoke (D5); if it
          // * jitters, expose the Lenis instance and wire lenis.on('scroll',
          // * ScrollTrigger.update). Left uncoupled here: LenisProvider is shared
          // * with /library, so touching it is an escalation.
          // One CSS variable write per tick (AC-2 / AC-5), no per-row work.
          onUpdate: () => setGroundBase(lerpHex(fromHex, toHex, proxy.t)),
        })
      }

      // Sentinel geometry can shift after this commit (late row or image layout)
      // while the triggers captured their start/end at creation. Recompute once
      // against the settled layout so the ramps line up with the real boundaries.
      ScrollTrigger.refresh()
    },
    { dependencies: [groups, reduced] },
  )

  // Reduced-motion path (AC-4 / D6): no ScrollTriggers. Hard-jump --ground-base
  // to the active year's era token (a var() reference, so the palette stays
  // single-sourced). An undated active group falls back to the flat base (D9).
  useEffect(() => {
    if (!reduced) return
    if (activeYear === null) {
      resetGroundBase()
      return
    }
    setGroundBase(eraVarRef(activeYear))
  }, [reduced, activeYear])

  // Always clear the override on unmount so navigating away drops the tint.
  useEffect(() => resetGroundBase, [])

  return null
}
