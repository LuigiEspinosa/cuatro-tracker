import Link from 'next/link'

export type BackToLibraryLinkProps = {
  medium: 'movies' | 'tv' | 'anime' | 'manga' | 'games'
}

export function BackToLibraryLink({ medium }: BackToLibraryLinkProps) {
  return (
    <Link href={`/${medium}`} className='back-to-library-link'>
      <svg
        className='back-to-library-link-arrow'
        viewBox='0 0 16 16'
        width={12}
        height={12}
        aria-hidden='true'
        focusable='false'
      >
        <path
          d='M11 3 L5 8 L11 13'
          stroke='currentColor'
          strokeWidth='1.5'
          fill='none'
          strokeLinecap='square'
          strokeLinejoin='miter'
        />
      </svg>
      <span className='back-to-library-link-label'>BACK TO LIBRARY</span>
    </Link>
  )
}
