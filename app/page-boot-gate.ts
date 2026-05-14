/* Story 5.5 first-load boot gate helpers, extracted from `app/page.tsx`
 * because Next.js app routes only allow specific named exports
 * (`default`, `metadata`, `dynamic`, etc.) and arbitrary helpers trigger a
 * `.next/types/app/page.ts` typecheck error.
 *
 * The dashboard page imports these directly. Tests target them in isolation.
 */

export type BootPhase = 'unknown' | 'playing' | 'skipped'

export const BOOT_LOCAL_STORAGE_KEY = 'boot.played'
export const BOOT_GATE_TTL_MS = 24 * 60 * 60 * 1000
export const BOOT_TOTAL_DURATION_MS = 1000

// Strict integer pattern: parseInt would happily accept '1234abc' or '-100'
// (the EH/AA review caught these). Anchor to digits-only so tampered or
// corrupted stamps replay the boot instead of skipping it forever.
const STAMP_PATTERN = /^\d+$/

export function safeRead(): string | null {
  try {
    return window.localStorage.getItem(BOOT_LOCAL_STORAGE_KEY)
  } catch {
    return null
  }
}

export function safeCommit(): void {
  try {
    window.localStorage.setItem(BOOT_LOCAL_STORAGE_KEY, Date.now().toString())
  } catch {
    // Safari Private Browsing / disabled storage: silently skip. The user
    // still got their reveal; they'll re-play the boot on next visit.
  }
}

export function resolveBootPhase(reduced: boolean): BootPhase {
  if (typeof window === 'undefined') return 'unknown'

  // Reduced-motion: commit + skip regardless of stored state. The commit
  // avoids an unwanted boot if the user toggles reduced-motion off later.
  if (reduced) {
    safeCommit()
    return 'skipped'
  }

  const stamp = safeRead()
  if (stamp !== null && STAMP_PATTERN.test(stamp)) {
    const ts = Number(stamp)
    const now = Date.now()
    // Clamp upper bound at `now` so a future-dated stamp (clock skew or
    // tampered write) can't keep the boot skipped indefinitely. Without this
    // a stamp set to `now + 1 year` would satisfy `now - ts < TTL` for a year.
    if (Number.isFinite(ts) && ts <= now && now - ts < BOOT_GATE_TTL_MS) {
      return 'skipped'
    }
  }
  return 'playing'
}

// Pure className mapping for the dashboard `<main>`. Tested in isolation to
// cover AC-7 bullet 1 ('unknown' renders dash-invisible) without trying to
// observe the pre-useEffect React render through RTL.
export function dashClassFor(phase: BootPhase): string {
  if (phase === 'unknown') return 'dash dash-invisible'
  if (phase === 'playing') return 'dash dash-ghost'
  return 'dash'
}
