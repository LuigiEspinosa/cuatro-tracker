export type LogoMarkProps = {
  className?: string
}

export function LogoMark({ className }: LogoMarkProps) {
  return (
    <span
      className={['lm', className].filter(Boolean).join(' ')}
      role='img'
      aria-label='Cuatro Tracker logo'
    >
      <span className='lm-blocks' aria-hidden='true'>
        <span className='lm-block lm-b1' />
        <span className='lm-block lm-b2' />
        <span className='lm-block lm-b3' />
      </span>
      <span className='lm-wordmark'>CUATRO TRACKER</span>
    </span>
  )
}
