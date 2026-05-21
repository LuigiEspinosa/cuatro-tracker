import Link from 'next/link'

export default function MangaNotFound() {
  return (
    <main className='anime-not-found'>
      <h1>&gt; MANGA NOT IN LIBRARY</h1>
      <p>Try adding it from the search.</p>
      <Link href='/manga' className='crt-pixel-button'>
        &gt; BACK TO MANGA LIBRARY
      </Link>
    </main>
  )
}
