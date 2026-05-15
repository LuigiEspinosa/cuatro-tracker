import Link from 'next/link'

export default function TvNotFound() {
  return (
    <main className='tv-not-found'>
      <h1>&gt; SHOW NOT IN LIBRARY</h1>
      <p>Try adding it from the search.</p>
      <Link href='/tv' className='crt-pixel-button'>
        &gt; BACK TO TV LIBRARY
      </Link>
    </main>
  )
}
