import type { ReactNode } from 'react'

export type CRTBezelSize = 'login' | 'hero'

export type CRTBezelProps = {
  children: ReactNode
  size?: CRTBezelSize
  className?: string
}

export function CRTBezel({ children, size = 'login', className }: CRTBezelProps) {
  const cls = className ? `crt bg-noise ${className}` : 'crt bg-noise'
  return (
    <div className={cls} data-size={size}>
      <svg
        className='crt-shell'
        viewBox='0 0 800 600'
        preserveAspectRatio='none'
        aria-hidden='true'
      >
        <defs>
          <linearGradient id='shellH' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='#D9CFB8' />
            <stop offset='0.5' stopColor='#C9BFA8' />
            <stop offset='1' stopColor='#A89E87' />
          </linearGradient>
          <linearGradient id='shellHi' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='#E8DEC4' />
            <stop offset='1' stopColor='#C9BFA8' stopOpacity='0' />
          </linearGradient>
          <linearGradient id='chinG' x1='0' y1='0' x2='0' y2='1'>
            <stop offset='0' stopColor='#BFB59E' />
            <stop offset='1' stopColor='#9C927B' />
          </linearGradient>
          <radialGradient id='ledG' cx='0.5' cy='0.5' r='0.5'>
            <stop offset='0' stopColor='#A8FF7B' />
            <stop offset='0.5' stopColor='#5DD46B' />
            <stop offset='1' stopColor='#2C5C2F' />
          </radialGradient>
        </defs>

        <rect x='0' y='0' width='800' height='600' fill='url(#shellH)' />
        <rect x='0' y='0' width='800' height='120' fill='url(#shellHi)' opacity='0.55' />

        <rect x='48' y='36' width='704' height='478' fill='#1A1426' />
        <rect
          x='48'
          y='36'
          width='704'
          height='478'
          fill='none'
          stroke='#5C5443'
          strokeWidth='2'
        />
        <rect x='50' y='38' width='700' height='2' fill='#2A1F3A' />
        <rect x='46' y='34' width='708' height='2' fill='#8E8470' />

        <rect x='0' y='514' width='800' height='86' fill='url(#chinG)' />
        <rect x='0' y='514' width='800' height='2' fill='#5C5443' />
        <rect x='0' y='516' width='800' height='2' fill='#E8DEC4' opacity='0.5' />

        <g opacity='0.55'>
          {Array.from({ length: 6 }).map((_, i) => (
            <rect
              key={`vent-l-${i}`}
              x={66 + i * 9}
              y='540'
              width='3'
              height='40'
              fill='#5C5443'
            />
          ))}
        </g>
        <g opacity='0.55'>
          {Array.from({ length: 6 }).map((_, i) => (
            <rect
              key={`vent-r-${i}`}
              x={680 + i * 9}
              y='540'
              width='3'
              height='40'
              fill='#5C5443'
            />
          ))}
        </g>

        <g transform='translate(400, 562)' textAnchor='middle'>
          <text
            x='0'
            y='0'
            fontFamily='IBM Plex Mono, monospace'
            fontSize='14'
            fontWeight='700'
            letterSpacing='6'
            fill='#5C5443'
            opacity='0.85'
          >
            CUATRO
          </text>
          <text
            x='0'
            y='-1'
            fontFamily='IBM Plex Mono, monospace'
            fontSize='14'
            fontWeight='700'
            letterSpacing='6'
            fill='#E8DEC4'
            opacity='0.4'
          >
            CUATRO
          </text>
        </g>

        <circle cx='730' cy='558' r='5' fill='url(#ledG)' />
        <circle cx='730' cy='558' r='9' fill='#5DD46B' opacity='0.18' />
        <text
          x='710'
          y='562'
          fontFamily='IBM Plex Mono, monospace'
          fontSize='9'
          letterSpacing='2'
          fill='#5C5443'
          textAnchor='end'
        >
          PWR
        </text>

        <rect x='0' y='0' width='6' height='600' fill='#000' opacity='0.18' />
        <rect x='794' y='0' width='6' height='600' fill='#000' opacity='0.18' />
        <rect x='0' y='0' width='800' height='3' fill='#fff' opacity='0.25' />
      </svg>
      <div className='crt-screen-wrap' data-testid='crt-screen-wrap'>
        {children}
      </div>
    </div>
  )
}
