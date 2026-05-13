export type BootFrameLabel =
  | 'power-on'
  | 'header-reveal'
  | 'version-line'
  | 'copyright-line'
  | 'progress-empty'
  | 'progress-25'
  | 'progress-50'
  | 'progress-75'
  | 'progress-100'
  | 'welcome-flash'

export type BootFrame = {
  readonly index: number
  readonly startMs: number
  readonly label: BootFrameLabel
}

export const BOOT_FRAMES = [
  { index: 1, startMs: 0, label: 'power-on' },
  { index: 2, startMs: 80, label: 'header-reveal' },
  { index: 3, startMs: 200, label: 'version-line' },
  { index: 4, startMs: 280, label: 'copyright-line' },
  { index: 5, startMs: 400, label: 'progress-empty' },
  { index: 6, startMs: 460, label: 'progress-25' },
  { index: 7, startMs: 600, label: 'progress-50' },
  { index: 8, startMs: 740, label: 'progress-75' },
  { index: 9, startMs: 880, label: 'progress-100' },
  { index: 10, startMs: 960, label: 'welcome-flash' },
] as const satisfies readonly BootFrame[]

export const BOOT_TOTAL_MS = 1200
export const BOOT_FINAL_FRAME_WITH_WELCOME = 10
export const BOOT_FINAL_FRAME_NO_WELCOME = 9
export const BOOT_PROGRESS_CELLS_TOTAL = 20

export function safeTotalDurationMs(totalDurationMs: number | undefined): number {
  if (totalDurationMs === undefined) return BOOT_TOTAL_MS
  if (!Number.isFinite(totalDurationMs) || totalDurationMs <= 0) return BOOT_TOTAL_MS
  return totalDurationMs
}

export function scaleFrames(
  frames: readonly BootFrame[],
  totalDurationMs: number
): readonly BootFrame[] {
  const safe = safeTotalDurationMs(totalDurationMs)
  const ratio = safe / BOOT_TOTAL_MS
  return frames.map((f) => ({ ...f, startMs: f.startMs * ratio }))
}

export function finalCallbackMs(showWelcome: boolean, totalDurationMs: number): number {
  const safe = safeTotalDurationMs(totalDurationMs)
  if (showWelcome) return safe
  const ratio = safe / BOOT_TOTAL_MS
  return BOOT_FRAMES[BOOT_FINAL_FRAME_NO_WELCOME].startMs * ratio
}

export function progressFill(frame: number): number {
  if (frame >= 9) return 20
  if (frame >= 8) return 15
  if (frame >= 7) return 10
  if (frame >= 6) return 5
  return 0
}

export function progressBar(frame: number): string {
  const fill = progressFill(frame)
  return '█'.repeat(fill) + ' '.repeat(BOOT_PROGRESS_CELLS_TOTAL - fill)
}

export const BOOT_HEADER_LABEL = 'CUATRO TRACKER'
export const BOOT_VERSION_LINE = 'VERSION 0.2.0'
export const BOOT_COPYRIGHT_LINE = '(C) CUATRO DEVELOPMENT STUDIO, 2026. ALL RIGHTS RESERVED.'
export const BOOT_READY_LINE = 'READY.'
export const BOOT_WELCOME_LINE = '> WELCOME, CUATRO'
