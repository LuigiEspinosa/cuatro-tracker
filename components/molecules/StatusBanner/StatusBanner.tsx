import { BitmapText, type BitmapTextTone } from '@/components/atoms/BitmapText'

export type StatusBannerVariant = 'error' | 'info' | 'warning'

export type StatusBannerProps = {
  variant: StatusBannerVariant
  primary: string
  secondary?: string
  className?: string
}

const TONE_BY_VARIANT: Record<StatusBannerVariant, BitmapTextTone> = {
  error: 'magenta',
  info: 'cream',
  warning: 'orange',
}

export function StatusBanner({
  variant,
  primary,
  secondary,
  className,
}: StatusBannerProps) {
  const cls = className ? `sb ${className}` : 'sb'
  const tone = TONE_BY_VARIANT[variant]
  return (
    <div className={cls} data-variant={variant} role='alert'>
      <BitmapText size={20} tone={tone} glow as='p' className='sb-primary'>
        {primary}
      </BitmapText>
      {secondary ? <p className='sb-secondary'>{secondary}</p> : null}
    </div>
  )
}
