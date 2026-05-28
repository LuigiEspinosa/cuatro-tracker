import Link from 'next/link'

export default function GameNotFound() {
  return (
    <main className='anime-not-found'>
      <h1>&gt; GAME NOT IN LIBRARY</h1>
      <p>Try adding it from the search.</p>
      <Link href='/games' className='crt-pixel-button'>
        &gt; BACK TO GAMES LIBRARY
      </Link>
    </main>
  )
}
