import Image from 'next/image'
import { CHROME_BY_MEDIUM } from './chrome'
import { MEDIA, tvInnerRadius } from './media-registry'
import type { Medium, Size } from './media-registry'

export type FramedCoverProps = {
  medium: Medium
  size: Size
  src: string
  alt: string
}

/* FramedCover (Story 2.6, design-system.md §0.2 + 09-frames.md).
 * Renders a cover image wrapped in per-medium chrome (VHS clamshell, CRT bezel,
 * 35mm slide mount, magazine plate, arcade marquee). Dimensions, strokes, and
 * per-medium quirks come from `media-registry.ts` (the typed port of the bundle's
 * MEDIA registry). Hover/focus glow rides on the parent's `:hover` / `:focus-visible`
 * via the per-medium CSS variable mapped in `app/global.css`. The ≤48px rendered-width
 * collapse rule fires via a CSS container query on the same outer container.
 *
 * Sizing strategy: `width: 100%` + `max-width: outerW` + `aspect-ratio: outerW/outerH`.
 * The outer container defaults to the bundle's per-size outerW; a constraining parent
 * (e.g. width: 32px) shrinks the FC and triggers the container query collapse rule.
 * The cover cutout uses percentage positioning so the chrome SVG and cutout stay
 * aligned regardless of the rendered size.
 *
 * This is a Server Component by design: no client state, no event handlers, no
 * effects. The visible interaction (hover glow) is pure CSS.
 */
export function FramedCover({ medium, size, src, alt }: FramedCoverProps) {
  const cfg = MEDIA[medium]
  const dims = cfg.sizes[size]
  const { outerW, outerH, padL, padT, innerW, innerH } = dims
  const Chrome = CHROME_BY_MEDIUM[medium]
  const innerR = medium === 'tv' ? tvInnerRadius(size) : 0

  const leftPct = (padL / outerW) * 100
  const topPct = (padT / outerH) * 100
  const widthPct = (innerW / outerW) * 100
  const heightPct = (innerH / outerH) * 100

  return (
    <div
      className='fc'
      data-medium={medium}
      data-size={size}
      style={{ width: outerW, maxWidth: '100%', aspectRatio: `${outerW} / ${outerH}` }}
    >
      <div
        className='fc-cover-cutout'
        style={{
          left: `${leftPct}%`,
          top: `${topPct}%`,
          width: `${widthPct}%`,
          height: `${heightPct}%`,
          borderRadius: innerR,
        }}
      >
        <Image src={src} alt={alt} width={innerW} height={innerH} unoptimized />
      </div>
      <Chrome size={size} dims={dims} hex={cfg.strokeHex} />
    </div>
  )
}
