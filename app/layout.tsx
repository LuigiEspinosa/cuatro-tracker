import type { Metadata } from 'next'
import type { Session } from 'next-auth'
import {
  Cormorant_Garamond,
  EB_Garamond,
  IBM_Plex_Mono,
  VT323,
} from 'next/font/google'
import Script from 'next/script'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { logger } from '@/lib/logger'
import { MainNav } from '@/components/organisms/MainNav'
import { Providers } from './providers'
import './global.css'

const displaySerif = Cormorant_Garamond({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['500', '600'],
  style: ['normal'],
  display: 'swap',
  fallback: [
    'Editorial New',
    'Cormorant Garamond Display',
    'EB Garamond',
    'Georgia',
    'serif',
  ],
})

const bodySerif = EB_Garamond({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal'],
  display: 'swap',
  fallback: ['Georgia', 'serif'],
})

const monoSans = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '600'],
  style: ['normal'],
  display: 'swap',
  fallback: ['ui-monospace', 'Menlo', 'monospace'],
})

const bitmapFace = VT323({
  variable: '--font-bitmap',
  subsets: ['latin'],
  weight: ['400'],
  display: 'swap',
  fallback: ['ui-monospace', 'monospace'],
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

  const umamiId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim()
  const showUmami = Boolean(session) && Boolean(umamiId)

  return (
    <html
      lang="en"
      className={`${displaySerif.variable} ${bodySerif.variable} ${monoSans.variable} ${bitmapFace.variable}`}
    >
      <head>
        {showUmami && (
          <Script
            src="https://umami.cuatro.dev/script.js"
            data-website-id={umamiId}
            strategy="afterInteractive"
          />
        )}
      </head>
      <body className="antialiased">
        <Providers session={session}>
          <MainNav />
          {children}
        </Providers>
      </body>
    </html>
  )
}
