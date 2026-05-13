'use client'

import { createPortal } from 'react-dom'

export type ChannelFlipTransitionProps = {
  progress: number
}

export function ChannelFlipTransition({ progress }: ChannelFlipTransitionProps) {
  if (!Number.isFinite(progress)) return null
  if (progress <= 0) return null
  if (typeof document === 'undefined') return null

  const clamped = Math.min(Math.max(progress, 0), 1)
  const bandTop = `${clamped * 100}%`

  return createPortal(
    <div className='cft' role='presentation' aria-hidden='true'>
      <div className='cft-black-above' style={{ height: bandTop }} />
      <div className='cft-band' style={{ top: bandTop }} />
    </div>,
    document.body
  )
}
