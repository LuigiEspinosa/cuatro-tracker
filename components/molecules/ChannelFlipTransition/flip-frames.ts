export const FLIP_TOTAL_MS = 600 as const
export const FLIP_BAND_SWEEP_MS = 200 as const
export const FLIP_HOLD_BLACK_MS = 200 as const
export const FLIP_REVEAL_MS = 200 as const
export const FLIP_ROUTE_CHANGE_MS = FLIP_BAND_SWEEP_MS

export type FlipPhases = {
  bandSweepMs: number
  holdBlackMs: number
  revealMs: number
  totalMs: number
  routeChangeMs: number
}

export function safeTotalDurationMs(input?: number): number {
  if (typeof input !== 'number') return FLIP_TOTAL_MS
  if (!Number.isFinite(input)) return FLIP_TOTAL_MS
  if (input <= 0) return FLIP_TOTAL_MS
  return input
}

export function scalePhases(totalDurationMs?: number): FlipPhases {
  const total = safeTotalDurationMs(totalDurationMs)
  const ratio = total / FLIP_TOTAL_MS
  const bandSweepMs = FLIP_BAND_SWEEP_MS * ratio
  const holdBlackMs = FLIP_HOLD_BLACK_MS * ratio
  const revealMs = FLIP_REVEAL_MS * ratio
  return {
    bandSweepMs,
    holdBlackMs,
    revealMs,
    totalMs: total,
    routeChangeMs: bandSweepMs,
  }
}
