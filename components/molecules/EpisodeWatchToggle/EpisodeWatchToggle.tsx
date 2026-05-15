'use client'

export type EpisodeWatchToggleProps = {
  checked: boolean
  disabled?: boolean
  label: string
  onToggle: () => void
}

export function EpisodeWatchToggle({
  checked,
  disabled = false,
  label,
  onToggle,
}: EpisodeWatchToggleProps) {
  return (
    <button
      type='button'
      role='checkbox'
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      aria-label={label}
      title={disabled ? 'UNAIRED — CANNOT MARK WATCHED' : label}
      disabled={disabled}
      className='episode-watch-toggle crt-pixel-checkbox'
      data-checked={checked ? 'true' : 'false'}
      onClick={() => {
        if (!disabled) onToggle()
      }}
    >
      <span className='episode-watch-toggle-mark' aria-hidden='true'>
        {checked ? '×' : ' '}
      </span>
    </button>
  )
}
