import type { CSSProperties, JSX, ReactNode } from 'react'

export type BitmapTextTone = 'cream' | 'cream-dim' | 'cream-ghost' | 'magenta'

export type BitmapTextProps = {
  children: ReactNode
  size?: number
  tone?: BitmapTextTone
  glow?: boolean
  className?: string
  as?: keyof JSX.IntrinsicElements
}

const TONE_VAR: Record<BitmapTextTone, string> = {
  cream: 'var(--phosphor-cream)',
  'cream-dim': 'var(--phosphor-cream-dim)',
  'cream-ghost': 'var(--phosphor-cream-ghost)',
  magenta: 'var(--magenta)',
}

const GLOW_SHADOW: Record<BitmapTextTone, string> = {
  cream: '0 0 8px rgba(239, 230, 212, 0.4)',
  'cream-dim': '0 0 8px rgba(239, 230, 212, 0.4)',
  'cream-ghost': '0 0 8px rgba(239, 230, 212, 0.4)',
  magenta: '0 0 8px rgba(214, 53, 124, 0.55)',
}

export function BitmapText({
  children,
  size = 18,
  tone = 'cream',
  glow = false,
  className,
  as,
}: BitmapTextProps) {
  const Tag = (as ?? 'span') as keyof JSX.IntrinsicElements
  const style: CSSProperties & Record<string, string | number> = {
    fontSize: `${size}px`,
    ['--bt-color']: TONE_VAR[tone],
  }
  if (glow) style.textShadow = GLOW_SHADOW[tone]
  const cls = className ? `bt ${className}` : 'bt'
  return <Tag className={cls} style={style}>{children}</Tag>
}
