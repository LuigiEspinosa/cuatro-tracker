import type { MediaDims, Size } from '../media-registry'

type ChromeProps = {
  size: Size
  dims: MediaDims
  hex: string
}

/* Games arcade marquee chrome.
 * Outer rect stroke + (card / hero) banner bottom edge + (hero only)
 * interior #7B5CFF glow at 6% opacity inside the banner area + 2 side
 * trim posts + 9 decorative bulb dots.
 * Per 09-frames.md §3.5: this is the ONE place a chrome carries colored
 * interior light; the synth-purple hex is hard-coded intentionally.
 * Ported from bundle framed-cover.jsx lines 232-278.
 */
export function ChromeGames({ size, dims, hex }: ChromeProps) {
  const { outerW, outerH, padL, padR, padT, innerW, strokeW } = dims
  const bannerInnerStroke = size === 'hero' ? 2 : 1
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
        <>
          <line
            x1={strokeW}
            y1={padT}
            x2={outerW - strokeW}
            y2={padT}
            stroke={hex}
            strokeWidth={bannerInnerStroke}
            className='fc-chrome-banner'
          />
          {size === 'hero' && (
            <g className='fc-chrome-marquee-glow'>
              <rect x={strokeW} y={strokeW} width={outerW - 2 * strokeW} height={padT - strokeW} fill='#7B5CFF' opacity={0.06} />
              <line x1={padL} y1={strokeW} x2={padL} y2={padT} stroke={hex} strokeWidth={1} />
              <line x1={outerW - padR} y1={strokeW} x2={outerW - padR} y2={padT} stroke={hex} strokeWidth={1} />
              {Array.from({ length: 9 }).map((_, i) => {
                const cx = padL + (innerW / 10) * (i + 1)
                return <circle key={`bulb-${i}`} cx={cx} cy={padT / 2} r={2} fill='#7B5CFF' opacity={0.35} />
              })}
            </g>
          )}
        </>
      )}
    </svg>
  )
}
