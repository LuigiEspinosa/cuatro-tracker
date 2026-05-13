import { describe, expect, it } from 'vitest'
import {
  BOOT_FINAL_FRAME_NO_WELCOME,
  BOOT_FINAL_FRAME_WITH_WELCOME,
  BOOT_FRAMES,
  BOOT_PROGRESS_CELLS_TOTAL,
  BOOT_TOTAL_MS,
  finalCallbackMs,
  progressBar,
  progressFill,
  scaleFrames,
} from '../boot-frames'

describe('BOOT_FRAMES registry', () => {
  it('has 10 frames numbered 1 through 10', () => {
    expect(BOOT_FRAMES).toHaveLength(10)
    expect(BOOT_FRAMES.map((f) => f.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('preserves the bundle 01-login.md §5 timing exactly', () => {
    const expected = [0, 80, 200, 280, 400, 460, 600, 740, 880, 960]
    expect(BOOT_FRAMES.map((f) => f.startMs)).toEqual(expected)
  })

  it('startMs values are strictly monotonic', () => {
    for (let i = 1; i < BOOT_FRAMES.length; i++) {
      expect(BOOT_FRAMES[i].startMs).toBeGreaterThan(BOOT_FRAMES[i - 1].startMs)
    }
  })

  it('labels match the bundle frame names', () => {
    expect(BOOT_FRAMES.map((f) => f.label)).toEqual([
      'power-on',
      'header-reveal',
      'version-line',
      'copyright-line',
      'progress-empty',
      'progress-25',
      'progress-50',
      'progress-75',
      'progress-100',
      'welcome-flash',
    ])
  })

  it('exports the final-frame constants the AC binds against', () => {
    expect(BOOT_FINAL_FRAME_WITH_WELCOME).toBe(10)
    expect(BOOT_FINAL_FRAME_NO_WELCOME).toBe(9)
    expect(BOOT_TOTAL_MS).toBe(1200)
    expect(BOOT_PROGRESS_CELLS_TOTAL).toBe(20)
  })
})

describe('scaleFrames', () => {
  it('returns identical timings when totalDurationMs equals BOOT_TOTAL_MS', () => {
    const scaled = scaleFrames(BOOT_FRAMES, BOOT_TOTAL_MS)
    expect(scaled.map((f) => f.startMs)).toEqual(BOOT_FRAMES.map((f) => f.startMs))
  })

  it('scales proportionally for a 2x totalDurationMs', () => {
    const scaled = scaleFrames(BOOT_FRAMES, BOOT_TOTAL_MS * 2)
    for (let i = 0; i < scaled.length; i++) {
      expect(scaled[i].startMs).toBe(BOOT_FRAMES[i].startMs * 2)
    }
  })

  it('scales proportionally for a 0.5x totalDurationMs', () => {
    const scaled = scaleFrames(BOOT_FRAMES, BOOT_TOTAL_MS / 2)
    for (let i = 0; i < scaled.length; i++) {
      expect(scaled[i].startMs).toBe(BOOT_FRAMES[i].startMs / 2)
    }
  })

  it('preserves index and label after scaling', () => {
    const scaled = scaleFrames(BOOT_FRAMES, 600)
    expect(scaled.map((f) => f.index)).toEqual(BOOT_FRAMES.map((f) => f.index))
    expect(scaled.map((f) => f.label)).toEqual(BOOT_FRAMES.map((f) => f.label))
  })

  it('does not mutate the source registry', () => {
    const snapshot = BOOT_FRAMES.map((f) => f.startMs)
    scaleFrames(BOOT_FRAMES, 3000)
    expect(BOOT_FRAMES.map((f) => f.startMs)).toEqual(snapshot)
  })

  it('falls back to BOOT_TOTAL_MS when totalDurationMs is invalid', () => {
    expect(scaleFrames(BOOT_FRAMES, 0).map((f) => f.startMs)).toEqual(
      BOOT_FRAMES.map((f) => f.startMs)
    )
    expect(scaleFrames(BOOT_FRAMES, -500).map((f) => f.startMs)).toEqual(
      BOOT_FRAMES.map((f) => f.startMs)
    )
    expect(scaleFrames(BOOT_FRAMES, Number.NaN).map((f) => f.startMs)).toEqual(
      BOOT_FRAMES.map((f) => f.startMs)
    )
    expect(scaleFrames(BOOT_FRAMES, Number.POSITIVE_INFINITY).map((f) => f.startMs)).toEqual(
      BOOT_FRAMES.map((f) => f.startMs)
    )
  })
})

describe('finalCallbackMs', () => {
  it('returns the full totalDurationMs (end of frame 10) when showWelcome is true', () => {
    expect(finalCallbackMs(true, BOOT_TOTAL_MS)).toBe(BOOT_TOTAL_MS)
    expect(finalCallbackMs(true, 2400)).toBe(2400)
  })

  it('returns frame 10 startMs (= end of frame 9 display window, scaled) when showWelcome is false', () => {
    expect(finalCallbackMs(false, BOOT_TOTAL_MS)).toBe(960)
    expect(finalCallbackMs(false, BOOT_TOTAL_MS * 2)).toBe(1920)
  })

  it('falls back to BOOT_TOTAL_MS when totalDurationMs is invalid', () => {
    expect(finalCallbackMs(true, 0)).toBe(BOOT_TOTAL_MS)
    expect(finalCallbackMs(true, -100)).toBe(BOOT_TOTAL_MS)
    expect(finalCallbackMs(true, Number.NaN)).toBe(BOOT_TOTAL_MS)
    expect(finalCallbackMs(true, Number.POSITIVE_INFINITY)).toBe(BOOT_TOTAL_MS)
  })
})

describe('progressFill', () => {
  it('returns 0 for frames 1-5 (no fill cells until frame 6)', () => {
    expect(progressFill(1)).toBe(0)
    expect(progressFill(2)).toBe(0)
    expect(progressFill(3)).toBe(0)
    expect(progressFill(4)).toBe(0)
    expect(progressFill(5)).toBe(0)
  })

  it('returns 5/10/15/20 for frames 6/7/8/9 per the bundle threshold', () => {
    expect(progressFill(6)).toBe(5)
    expect(progressFill(7)).toBe(10)
    expect(progressFill(8)).toBe(15)
    expect(progressFill(9)).toBe(20)
  })

  it('returns 20 for frame 10 (full)', () => {
    expect(progressFill(10)).toBe(20)
  })
})

describe('progressBar', () => {
  it('returns 20 spaces for frame ≤ 5', () => {
    const bar = progressBar(5)
    expect(bar).toHaveLength(20)
    expect(bar).toBe(' '.repeat(20))
  })

  it('returns 5 filled + 15 empty for frame 6', () => {
    const bar = progressBar(6)
    expect(bar).toHaveLength(20)
    expect(bar).toBe('█'.repeat(5) + ' '.repeat(15))
  })

  it('returns 20 filled for frame 9 and frame 10', () => {
    expect(progressBar(9)).toBe('█'.repeat(20))
    expect(progressBar(10)).toBe('█'.repeat(20))
  })
})
