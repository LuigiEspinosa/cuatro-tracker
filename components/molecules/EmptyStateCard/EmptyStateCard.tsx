import { BitmapText } from '@/components/atoms/BitmapText'
import { CRTPixelButton } from '@/components/atoms/CRTPixelButton'

export type EmptyStateCardVariant = 'hero' | 'band'

export type EmptyStateCardProps = {
  variant?: EmptyStateCardVariant
  headline: string
  secondLine?: string
  subtitle?: string
  ctaLabel?: string
  onCta?: () => void
  className?: string
}

export function EmptyStateCard({
  variant = 'band',
  headline,
  secondLine,
  subtitle,
  ctaLabel,
  onCta,
  className,
}: EmptyStateCardProps) {
  const cls = className ? `esc ${className}` : 'esc'
  const isHero = variant === 'hero'
  const headlineSize = isHero ? 24 : 18
  return (
    <div className={cls} data-variant={variant}>
      <BitmapText size={headlineSize} tone='cream' as='p' className='esc-headline'>
        &gt; {headline}
      </BitmapText>
      {isHero && secondLine ? (
        <BitmapText size={18} tone='cream-dim' as='p' className='esc-second-line'>
          {secondLine}
        </BitmapText>
      ) : null}
      {subtitle ? <p className='esc-subtitle'>{subtitle}</p> : null}
      {isHero && ctaLabel ? (
        <CRTPixelButton onClick={onCta} fullWidth={false} className='esc-cta'>
          &gt; {ctaLabel}
        </CRTPixelButton>
      ) : null}
    </div>
  )
}
