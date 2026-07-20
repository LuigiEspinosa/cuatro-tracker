'use client'
// Client component: the RETRY button reloads the page, which needs a browser
// event handler. Rendered only by the RSC page's catch branch (Story 11.4 AC-7).

import { BitmapText } from '@/components/atoms/BitmapText'
import { CRTPixelButton } from '@/components/atoms/CRTPixelButton'

export function MergeErrorState() {
  return (
    <div className='merge-state merge-state-error' role='alert'>
      <BitmapText size={30} tone='magenta' glow>
        {'> COULD NOT LOAD MERGE QUEUE'}
      </BitmapText>
      <p className='merge-state-sub'>Refresh the page or check the worker.</p>
      <CRTPixelButton
        fullWidth={false}
        className='merge-retry-btn'
        onClick={() => window.location.reload()}
      >
        {'> RETRY'}
      </CRTPixelButton>
    </div>
  )
}
