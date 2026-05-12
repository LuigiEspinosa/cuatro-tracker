import type { MediaDims, Size } from '../media-registry'

type ChromeProps = {
  size: Size
  dims: MediaDims
  hex: string
}

/* Anime 35mm slide mount chrome.
 * Outer rect stroke + (card / hero) sprocket holes cut along top + bottom.
 * Holes fill the page substrate var(--ground-base) so era-tinted timelines
 * see-through correctly.
 * Ported from bundle framed-cover.jsx lines 169-199.
 */
export function ChromeAnime({ size, dims, hex }: ChromeProps) {
  const { outerW, outerH, padL, padT, padB, innerW, innerH, strokeW } = dims
  const holeCount = size === 'card' ? 6 : size === 'hero' ? 12 : 0
  const holeW = size === 'card' ? 4 : 8
  const holeH = size === 'card' ? 6 : 12
  const holeStrokeW = size === 'hero' ? 2 : 1
  const segment = holeCount > 0 ? innerW / holeCount : 0
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
      {holeCount > 0 &&
        Array.from({ length: holeCount }).map((_, i) => {
          const cx = padL + segment * (i + 0.5)
          const x = cx - holeW / 2
          const topY = (padT - holeH) / 2
          const botY = padT + innerH + (padB - holeH) / 2
          return (
            <g key={`sprocket-${i}`} className='fc-chrome-sprocket-hole'>
              <rect x={x} y={topY} width={holeW} height={holeH} fill='var(--ground-base)' stroke={hex} strokeWidth={holeStrokeW} />
              <rect x={x} y={botY} width={holeW} height={holeH} fill='var(--ground-base)' stroke={hex} strokeWidth={holeStrokeW} />
            </g>
          )
        })}
    </svg>
  )
}
