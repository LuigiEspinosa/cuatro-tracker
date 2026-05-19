import Link from 'next/link'

export default function PreviewNotFound() {
  return (
    <main className='preview-not-found'>
      <h1>&gt; PREVIEW UNAVAILABLE</h1>
      <p>The source item couldn&apos;t be loaded.</p>
      <Link href='/search' className='crt-pixel-button'>
        &gt; BACK TO SEARCH
      </Link>
    </main>
  )
}
