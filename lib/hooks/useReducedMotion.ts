'use client'

import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

export function readInitialReducedMotion(override?: boolean): boolean {
  if (typeof override === 'boolean') return override
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(QUERY).matches
}

export function useReducedMotion(override?: boolean): boolean {
  const [reduced, setReduced] = useState<boolean>(() => readInitialReducedMotion(override))

  useEffect(() => {
    if (typeof override === 'boolean') {
      setReduced(override)
      return
    }
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(QUERY)
    setReduced(mql.matches)
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [override])

  return reduced
}
