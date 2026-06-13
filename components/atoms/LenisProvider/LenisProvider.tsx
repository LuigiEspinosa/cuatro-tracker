'use client'

import Lenis from 'lenis'
import { usePathname } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { useReducedMotion } from '@/lib/hooks/useReducedMotion'

const SCROLL_HEAVY_PREFIXES = ['/timeline', '/library'] as const

function isScrollHeavy(pathname: string | null): boolean {
  if (!pathname) return false
  for (const prefix of SCROLL_HEAVY_PREFIXES) {
    if (pathname === prefix) return true
    if (pathname.startsWith(`${prefix}/`)) return true
  }
  return false
}

export function LenisProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const reduced = useReducedMotion()
  // Smooth scroll is a motion effect: under prefers-reduced-motion, skip Lenis
  // and leave native scrolling in place (NFR / timeline AC-4).
  const active = isScrollHeavy(pathname) && !reduced

  useEffect(() => {
    if (!active) return
    const lenis = new Lenis()
    let frameId: number | null = null
    const raf = (time: number) => {
      lenis.raf(time)
      frameId = requestAnimationFrame(raf)
    }
    frameId = requestAnimationFrame(raf)
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
      lenis.destroy()
    }
  }, [active])

  return <>{children}</>
}
