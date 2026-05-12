import type { MediaDims, Size } from '../media-registry'

type ChromeProps = {
  size: Size
  dims: MediaDims
  hex: string
}

/* Movies VHS clamshell chrome.
 * Outer rect stroke + (card) vertical spine demarcation hairline + (hero)
 * 2px spine demarcation, 1px horizontal label-split at midpoint,
 * decorative IBM Plex Mono spine label rotated -90deg.
 * Ported from bundle framed-cover.jsx lines 100-139.
 */
export function ChromeMovies({ size, dims, hex }: ChromeProps) {
  const { outerW, outerH, padL, strokeW } = dims
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
      {size === 'card' && (
        <line
          x1={padL - 0.5}
          y1={strokeW}
          x2={padL - 0.5}
          y2={outerH - strokeW}
          stroke={hex}
          strokeWidth={1}
          className='fc-chrome-spine'
        />
      )}
      {size === 'hero' && (
        <g className='fc-chrome-spine'>
          <line x1={padL - 1} y1={strokeW} x2={padL - 1} y2={outerH - strokeW} stroke={hex} strokeWidth={2} />
          <line x1={strokeW} y1={outerH / 2} x2={padL - 2} y2={outerH / 2} stroke={hex} strokeWidth={1} />
          <text
            x={padL / 2 + 1}
            y={outerH / 2 - 80}
            fontFamily='IBM Plex Mono, monospace'
            fontSize={11}
            fontWeight={500}
            letterSpacing={2.6}
            fill={hex}
            opacity={0.65}
            textAnchor='middle'
            transform={`rotate(-90 ${padL / 2 + 1} ${outerH / 2 - 80})`}
          >
            CUATRO · 1996
          </text>
        </g>
      )}
    </svg>
  )
}
