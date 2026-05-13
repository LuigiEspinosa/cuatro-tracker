export type PhosphorBarProps = {
  value: number
  max: number
  label: string
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(value, min), max)
}

export function PhosphorBar({ value, max, label }: PhosphorBarProps) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0
  const clamped = safeMax > 0 ? clamp(value, 0, safeMax) : 0
  const pct = safeMax > 0 ? (clamped / safeMax) * 100 : 0
  const tooltip = `${label} (${clamped} / ${safeMax})`

  return (
    <div
      role='progressbar'
      aria-label={label}
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      title={tooltip}
      className='pb'
    >
      <div className='pb-fill' style={{ width: `${pct}%` }} />
    </div>
  )
}
