import type { MediaDims, Size } from '../media-registry'
import { tvInnerRadius } from '../media-registry'

type ChromeProps = {
  size: Size
  dims: MediaDims
  hex: string
}

/* TV CRT bezel chrome.
 * Outer rect stroke + (card / hero) inner-edge depth hairline inset 1px
 * from the cover well, with rounded corners matching the TV inner radius.
 * Ported from bundle framed-cover.jsx lines 141-167.
 */
export function ChromeTv({ size, dims, hex }: ChromeProps) {
  const { outerW, outerH, padL, padT, innerW, innerH, strokeW } = dims
  const innerR = tvInnerRadius(size)
  return (
    <svg
      className='fc-chrome-svg'
      viewBox={`0 0 ${outerW} ${outerH}`}
      preserveAspectRatio='none'
      aria-hidden='true'
    >
      <rect
        x={strokeW / 2}
        y={strokeW / 2}
        width={outerW - strokeW}
        height={outerH - strokeW}
        fill='none'
        stroke={hex}
        strokeWidth={strokeW}
        className='fc-chrome-outer-stroke'
      />
      {size !== 'thumb' && (
        <rect
          x={padL + 1}
          y={padT + 1}
          width={innerW - 2}
          height={innerH - 2}
          rx={Math.max(0, innerR - 1)}
          ry={Math.max(0, innerR - 1)}
          fill='none'
          stroke='rgba(0,0,0,0.72)'
          strokeWidth={size === 'hero' ? 2 : 1}
          className='fc-chrome-inner-depth'
        />
      )}
    </svg>
  )
}
