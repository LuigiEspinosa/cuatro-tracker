'use client'

import * as Sentry from '@sentry/nextjs'
import type { Session } from 'next-auth'
import { SessionProvider } from 'next-auth/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState, type ReactNode } from 'react'
import { LenisProvider } from '@/components/atoms/LenisProvider'
import { SentryErrorFallback } from '@/components/atoms/SentryErrorFallback'
import { env } from '@/lib/env'

export function Providers({
  children,
  session,
}: {
  children: ReactNode
  session?: Session | null
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60 * 1000 },
        },
      }),
  )

  const isDev = env.NODE_ENV === 'development'

  return (
    <Sentry.ErrorBoundary fallback={SentryErrorFallback}>
      <SessionProvider session={session}>
        <QueryClientProvider client={queryClient}>
          <LenisProvider>{children}</LenisProvider>
          {isDev ? <ReactQueryDevtools initialIsOpen={false} /> : null}
        </QueryClientProvider>
      </SessionProvider>
    </Sentry.ErrorBoundary>
  )
}
