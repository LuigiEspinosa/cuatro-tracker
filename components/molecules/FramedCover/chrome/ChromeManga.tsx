import type { MediaDims, Size } from '../media-registry'

type ChromeProps = {
  size: Size
  dims: MediaDims
  hex: string
}

/* Manga magazine plate chrome.
 * Outer rect stroke + (card / hero) corner `+` registration marks at all 4
 * corners. Mark size + inset + stroke scale per size.
 * Ported from bundle framed-cover.jsx lines 201-230.
 */
export function ChromeManga({ size, dims, hex }: ChromeProps) {
  const { outerW, outerH, strokeW } = dims
  const markSize = size === 'card' ? 6 : size === 'hero' ? 12 : 0
  const markInset = size === 'card' ? 2 : 4
  const markStrokeW = size === 'hero' ? 1.5 : 1

  function renderMark(cx: number, cy: number, key: string) {
    return (
      <g key={key} className='fc-chrome-registration-mark'>
        <line x1={cx - markSize / 2} y1={cy} x2={cx + markSize / 2} y2={cy} stroke={hex} strokeWidth={markStrokeW} />
        <line x1={cx} y1={cy - markSize / 2} x2={cx} y2={cy + markSize / 2} stroke={hex} strokeWidth={markStrokeW} />
      </g>
    )
  }

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
      {markSize > 0 && (
        <>
          {renderMark(markInset + markSize / 2, markInset + markSize / 2, 'tl')}
          {renderMark(outerW - markInset - markSize / 2, markInset + markSize / 2, 'tr')}
          {renderMark(markInset + markSize / 2, outerH - markInset - markSize / 2, 'bl')}
          {renderMark(outerW - markInset - markSize / 2, outerH - markInset - markSize / 2, 'br')}
        </>
      )}
    </svg>
  )
}
