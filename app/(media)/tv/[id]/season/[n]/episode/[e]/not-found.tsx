import Link from 'next/link'

export default function EpisodeNotFound() {
  return (
    <main className='episode-not-found'>
      <h1>&gt; EPISODE NOT FOUND</h1>
      <p>The episode isn&apos;t in your library, or doesn&apos;t exist.</p>
      <Link href='/tv' className='crt-pixel-button'>
        &gt; BACK TO TV LIBRARY
      </Link>
    </main>
  )
}
