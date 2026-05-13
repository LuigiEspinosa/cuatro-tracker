'use client'

import gsap from 'gsap'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ChannelFlipTransition } from './ChannelFlipTransition'
import { safeTotalDurationMs, scalePhases } from './flip-frames'

export type UseChannelFlipNavigateOptions = {
  totalDuration?: number
  reducedMotionOverride?: boolean
}

export type ChannelFlipNavigate = (target: string) => Promise<void>

function readInitialReducedMotion(override?: boolean): boolean {
  if (typeof override === 'boolean') return override
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function usePrefersReducedMotion(override: boolean | undefined, initial: boolean): boolean {
  const [reduced, setReduced] = useState<boolean>(initial)

  useEffect(() => {
    if (typeof override === 'boolean') {
      setReduced(override)
      return
    }
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mql.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [override])

  return reduced
}

export function useChannelFlipNavigate(
  options: UseChannelFlipNavigateOptions = {}
): {
  navigate: ChannelFlipNavigate
  overlay: React.ReactNode
} {
  const { totalDuration, reducedMotionOverride } = options
  const router = useRouter()
  const initialReduced = readInitialReducedMotion(reducedMotionOverride)
  const reduced = usePrefersReducedMotion(reducedMotionOverride, initialReduced)
  const [progress, setProgress] = useState(0)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const rafRef = useRef<number | null>(null)
  const reducedRef = useRef(reduced)
  const mountedRef = useRef(true)

  useEffect(() => {
    reducedRef.current = reduced
  }, [reduced])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      timelineRef.current?.kill()
      timelineRef.current = null
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [])

  const navigate = useCallback<ChannelFlipNavigate>(
    (target) => {
      return new Promise<void>((resolve) => {
        const safePush = () => {
          try {
            router.push(target)
          } catch {
            // Router throws on invalid target; surface as a no-op so the Promise
            // still resolves cleanly. Consumer-side logging is consumer responsibility.
          }
        }

        if (reducedRef.current) {
          safePush()
          if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
            resolve()
            return
          }
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null
            resolve()
          })
          return
        }

        timelineRef.current?.kill()
        setProgress(0)
        const phases = scalePhases(safeTotalDurationMs(totalDuration))
        const driver = { p: 0 }
        let routePushed = false
        const tl = gsap.timeline({
          onUpdate: () => {
            if (mountedRef.current) setProgress(driver.p)
          },
          onComplete: () => {
            timelineRef.current = null
            resolve()
          },
        })
        tl.to(driver, {
          p: 1,
          duration: phases.bandSweepMs / 1000,
          ease: 'none',
          onComplete: () => {
            if (!routePushed) {
              routePushed = true
              safePush()
            }
          },
        })
        tl.to(driver, { p: 1, duration: phases.holdBlackMs / 1000, ease: 'none' })
        tl.to(driver, { p: 0, duration: phases.revealMs / 1000, ease: 'none' })
        timelineRef.current = tl
      })
    },
    [router, totalDuration]
  )

  const overlay = <ChannelFlipTransition progress={progress} />

  return { navigate, overlay }
}
