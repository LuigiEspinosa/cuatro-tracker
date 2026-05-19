import Link from 'next/link'

export default function AnimeNotFound() {
  return (
    <main className='anime-not-found'>
      <h1>&gt; ANIME NOT IN LIBRARY</h1>
      <p>Try adding it from the search.</p>
      <Link href='/anime' className='crt-pixel-button'>
        &gt; BACK TO ANIME LIBRARY
      </Link>
    </main>
  )
}
