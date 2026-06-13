'use client'

// The timeline store is framework-agnostic and node-testable, so it cannot call
// the useSearchParams React hook. This adapter owns the URL side effects: it
// hydrates the store from the deep-linked URL on mount and writes store changes
// back to the URL (debounced) so every view is a shareable link.

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { serializeTimelineState, useTimelineStore } from '@/store/timeline'

const URL_SYNC_DEBOUNCE_MS = 250

export function useTimelineUrlSync(): void {
  const searchParams = useSearchParams()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    useTimelineStore
      .getState()
      .hydrateFromParams(new URLSearchParams(searchParams.toString()))
    // Mount-only hydration from the deep link. After mount the sync flows one
    // way (store to URL), so searchParams must not be a dependency or every URL
    // write would re-trigger hydration (the hydrate-to-write loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const unsubscribe = useTimelineStore.subscribe((state) => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        const next = serializeTimelineState(state).toString()
        const current = new URLSearchParams(window.location.search).toString()
        // Compare before writing. Right after hydration the two are equal, so
        // no write fires and the loop cannot start. Redundant writes (toggle
        // off then on inside the window) also collapse to nothing.
        if (next === current) return
        const path = window.location.pathname
        // ! window.history.replaceState, not router.replace. A shallow URL
        // ! update that does NOT re-run the timeline Server Component on each
        // ! change. router.replace refetches the page SSR and races the client
        // ! store: the stale-data class already fixed in LibraryGrid.
        window.history.replaceState(
          null,
          '',
          next.length > 0 ? `${path}?${next}` : path,
        )
      }, URL_SYNC_DEBOUNCE_MS)
    })

    return () => {
      unsubscribe()
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])
}
