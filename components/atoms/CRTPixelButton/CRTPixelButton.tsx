import { forwardRef, type ReactNode } from 'react'

export type CRTPixelButtonProps = {
  children: ReactNode
  type?: 'button' | 'submit'
  disabled?: boolean
  onClick?: () => void
  fullWidth?: boolean
  className?: string
}

export const CRTPixelButton = forwardRef<HTMLButtonElement, CRTPixelButtonProps>(
  function CRTPixelButton(
    { children, type = 'button', disabled = false, onClick, fullWidth = true, className },
    ref,
  ) {
    const cls = className ? `cpb ${className}` : 'cpb'
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        onClick={onClick}
        className={cls}
        data-inline={fullWidth ? undefined : 'true'}
      >
        {children}
      </button>
    )
  },
)
