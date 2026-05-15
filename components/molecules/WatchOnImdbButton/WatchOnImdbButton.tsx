import { CRTPixelButton } from '@/components/atoms/CRTPixelButton'

export type WatchOnImdbButtonProps = {
  imdbId: string | null
}

export function WatchOnImdbButton({ imdbId }: WatchOnImdbButtonProps) {
  if (!imdbId) return null
  const href = `https://www.playimdb.com/es/title/${imdbId}/`
  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      className='watch-on-imdb-link'
    >
      <CRTPixelButton fullWidth={false}>
        <svg
          className='watch-on-imdb-glyph'
          viewBox='0 0 8 8'
          width={8}
          height={8}
          aria-hidden='true'
          focusable='false'
        >
          <polygon points='1,1 7,4 1,7' fill='currentColor' />
        </svg>
        <span> WATCH</span>
      </CRTPixelButton>
    </a>
  )
}
