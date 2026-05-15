'use client'

import { toast } from 'sonner'
import { CRTPixelButton } from '@/components/atoms/CRTPixelButton'

export function SendToQbtButton() {
  return (
    <CRTPixelButton
      fullWidth={false}
      onClick={() => {
        toast('qBT WIRING DEFERRED TO E12')
      }}
    >
      <svg
        className='send-to-qbt-glyph'
        viewBox='0 0 8 8'
        width={8}
        height={8}
        aria-hidden='true'
        focusable='false'
      >
        <polygon points='1,1 7,4 1,7' fill='currentColor' />
      </svg>
      <span> SEND TO qBT</span>
    </CRTPixelButton>
  )
}
