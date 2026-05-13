import { describe, expect, it } from 'vitest'
import {
  FLIP_BAND_SWEEP_MS,
  FLIP_HOLD_BLACK_MS,
  FLIP_REVEAL_MS,
  FLIP_TOTAL_MS,
  safeTotalDurationMs,
  scalePhases,
} from '../flip-frames'

describe('flip-frames constants', () => {
  it('phase constants sum to FLIP_TOTAL_MS', () => {
    expect(FLIP_BAND_SWEEP_MS + FLIP_HOLD_BLACK_MS + FLIP_REVEAL_MS).toBe(FLIP_TOTAL_MS)
  })

  it('default phase is 200 / 200 / 200', () => {
    expect(FLIP_BAND_SWEEP_MS).toBe(200)
    expect(FLIP_HOLD_BLACK_MS).toBe(200)
    expect(FLIP_REVEAL_MS).toBe(200)
    expect(FLIP_TOTAL_MS).toBe(600)
  })
})

describe('safeTotalDurationMs', () => {
  it('returns the input when positive finite number', () => {
    expect(safeTotalDurationMs(900)).toBe(900)
    expect(safeTotalDurationMs(1)).toBe(1)
  })

  it('falls back to FLIP_TOTAL_MS for 0, negative, NaN, Infinity, and undefined', () => {
    expect(safeTotalDurationMs(undefined)).toBe(FLIP_TOTAL_MS)
    expect(safeTotalDurationMs(0)).toBe(FLIP_TOTAL_MS)
    expect(safeTotalDurationMs(-100)).toBe(FLIP_TOTAL_MS)
    expect(safeTotalDurationMs(Number.NaN)).toBe(FLIP_TOTAL_MS)
    expect(safeTotalDurationMs(Number.POSITIVE_INFINITY)).toBe(FLIP_TOTAL_MS)
    expect(safeTotalDurationMs(Number.NEGATIVE_INFINITY)).toBe(FLIP_TOTAL_MS)
  })
})

describe('scalePhases', () => {
  it('returns 200 / 200 / 200 / 600 at the default total', () => {
    const phases = scalePhases()
    expect(phases.bandSweepMs).toBe(200)
    expect(phases.holdBlackMs).toBe(200)
    expect(phases.revealMs).toBe(200)
    expect(phases.totalMs).toBe(600)
    expect(phases.routeChangeMs).toBe(200)
  })

  it('scales proportionally at 3000ms total (5x)', () => {
    const phases = scalePhases(3000)
    expect(phases.bandSweepMs).toBe(1000)
    expect(phases.holdBlackMs).toBe(1000)
    expect(phases.revealMs).toBe(1000)
    expect(phases.totalMs).toBe(3000)
    expect(phases.routeChangeMs).toBe(1000)
  })

  it('preserves the 1:1:1 phase ratio across totals', () => {
    const phases = scalePhases(900)
    expect(phases.bandSweepMs).toBe(phases.holdBlackMs)
    expect(phases.holdBlackMs).toBe(phases.revealMs)
    expect(phases.bandSweepMs + phases.holdBlackMs + phases.revealMs).toBe(phases.totalMs)
  })

  it('routeChangeMs equals bandSweepMs (midpoint of the 3-phase cycle)', () => {
    expect(scalePhases(1200).routeChangeMs).toBe(scalePhases(1200).bandSweepMs)
    expect(scalePhases().routeChangeMs).toBe(scalePhases().bandSweepMs)
  })

  it('folds invalid totals to FLIP_TOTAL_MS', () => {
    const phases = scalePhases(Number.NaN)
    expect(phases.totalMs).toBe(FLIP_TOTAL_MS)
    expect(phases.bandSweepMs).toBe(FLIP_BAND_SWEEP_MS)
  })
})
