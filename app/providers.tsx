'use client'

import * as Sentry from '@sentry/nextjs'
import type { Session } from 'next-auth'
import { SessionProvider } from 'next-auth/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState, type ReactNode } from 'react'
import { Toaster } from 'sonner'
import { LenisProvider } from '@/components/atoms/LenisProvider'
import { SentryErrorFallback } from '@/components/atoms/SentryErrorFallback'

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

  return (
    <Sentry.ErrorBoundary fallback={SentryErrorFallback}>
      <SessionProvider session={session}>
        <QueryClientProvider client={queryClient}>
          <LenisProvider>{children}</LenisProvider>
          <Toaster
            position='bottom-right'
            theme='dark'
            richColors={false}
            closeButton={false}
          />
          <ReactQueryDevtools initialIsOpen={false} />
        </QueryClientProvider>
      </SessionProvider>
    </Sentry.ErrorBoundary>
  )
}
