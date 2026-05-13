'use client'

export type SentryErrorFallbackProps = {
  error: unknown
  resetError: () => void
}

export function SentryErrorFallback({ resetError }: SentryErrorFallbackProps) {
  return (
    <main
      role='alert'
      className='flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--ground-base)] px-6 text-center text-[var(--phosphor-cream)]'
    >
      <h1 className='m-0 font-serif text-[48px] font-semibold italic leading-[1.05] tracking-tight'>
        Something broke
      </h1>
      <p className='m-0 font-mono text-[12px] uppercase tracking-[0.18em] text-[var(--phosphor-cream-dim)]'>
        the page crashed. sentry has the details. you can try again.
      </p>
      <button
        type='button'
        onClick={resetError}
        className='mt-2 rounded-none border-2 border-[var(--phosphor-cream)] bg-transparent px-6 py-3 font-mono text-[12px] uppercase tracking-[0.14em] text-[var(--phosphor-cream)] hover:bg-[var(--phosphor-cream)] hover:text-[var(--ground-base)]'
      >
        &gt; Try again
      </button>
    </main>
  )
}
