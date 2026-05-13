'use client'

import Lenis from 'lenis'
import { usePathname } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'

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
  const active = isScrollHeavy(pathname)

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
