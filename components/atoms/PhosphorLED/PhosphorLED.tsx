export type PhosphorLEDStatus =
  | 'completed'
  | 'in-progress'
  | 'backlog'
  | 'dropped'
  | 'on-hold'

export type PhosphorLEDProps = {
  status: PhosphorLEDStatus
  size?: number
  label: string
}

const DEFAULT_SIZE = 8

function safeSize(input?: number): number {
  if (typeof input !== 'number') return DEFAULT_SIZE
  if (!Number.isFinite(input)) return DEFAULT_SIZE
  if (input <= 0) return DEFAULT_SIZE
  return input
}

export function PhosphorLED({ status, size, label }: PhosphorLEDProps) {
  const px = safeSize(size)
  return (
    <span
      role='img'
      aria-label={label}
      title={label}
      className='led'
      data-status={status}
      style={{ width: px, height: px }}
    />
  )
}
