import Link from 'next/link'
import { CRTPixelButton } from '@/components/atoms/CRTPixelButton'

export default function MovieNotFound() {
  return (
    <main className='movie-detail-not-found'>
      <h1 className='movie-detail-not-found-title'>&gt; MOVIE NOT IN LIBRARY</h1>
      <p className='movie-detail-not-found-subtitle'>
        It may have been removed, or you may not have added it yet.
      </p>
      <Link href='/movies' className='movie-detail-not-found-link'>
        <CRTPixelButton fullWidth={false}>&gt; BACK TO LIBRARY</CRTPixelButton>
      </Link>
    </main>
  )
}
