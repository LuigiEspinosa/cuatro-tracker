import type { Metadata } from 'next'
import type { Session } from 'next-auth'
import { Geist, Geist_Mono } from 'next/font/google'
import Script from 'next/script'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { Providers } from './providers'
import './global.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Cuatro Tracker',
  description: 'A self-hosted, privacy-first media tracker',
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Wrapped in try/catch so a DB outage doesn't 500 every page (including /login).
  // The Umami script is opt-in chrome; rendering without it is acceptable degradation.
  let session: Session | null = null
  try {
    session = await getServerSession(authOptions)
  } catch (err) {
    logger.warn(
      { event: 'layout.session_fetch_failed', err },
      'getServerSession threw in root layout; rendering without session chrome',
    )
  }

  const umamiId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
  const showUmami = Boolean(session) && Boolean(umamiId)

  return (
    <html lang="en">
      <head>
        {showUmami && (
          <Script
            src="https://umami.cuatro.dev/script.js"
            data-website-id={umamiId}
            strategy="afterInteractive"
          />
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
