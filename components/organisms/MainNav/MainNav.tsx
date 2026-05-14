'use client'

import { usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { LogoMark } from '@/components/molecules/LogoMark'
import { useChannelFlipNavigate } from '@/components/molecules/ChannelFlipTransition'

const NAV_LINKS = [
  { label: 'Timeline', href: '/timeline' },
  { label: 'Library', href: '/library' },
  { label: 'Search', href: '/search' },
  { label: 'Admin', href: '/admin' },
] as const

function isActive(pathname: string | null, target: string): boolean {
  if (!pathname) return false
  if (pathname === target) return true
  return pathname.startsWith(`${target}/`)
}

export function MainNav() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const { navigate, overlay } = useChannelFlipNavigate()

  if (pathname === '/login') return null

  const userLabel = session?.user?.name ?? session?.user?.email ?? '???'

  return (
    <nav className='mn' aria-label='Primary navigation'>
      <div className='mn-left'>
        <button
          type='button'
          onClick={() => {
            void navigate('/')
          }}
          aria-label='Go to dashboard'
          className='mn-logo-link'
        >
          <LogoMark />
        </button>
      </div>
      <ul className='mn-links'>
        {NAV_LINKS.map((link) => {
          const active = isActive(pathname, link.href)
          return (
            <li key={link.href} className='mn-link-item'>
              <button
                type='button'
                onClick={() => {
                  void navigate(link.href)
                }}
                aria-current={active ? 'page' : undefined}
                className={['mn-link', active ? 'mn-link-active' : ''].filter(Boolean).join(' ')}
              >
                {link.label}
                {active ? (
                  <span className='mn-link-underline' aria-hidden='true'>
                    <span className='mn-link-underline-band' style={{ background: 'var(--rb-green)' }} />
                    <span className='mn-link-underline-band' style={{ background: 'var(--rb-yellow)' }} />
                    <span className='mn-link-underline-band' style={{ background: 'var(--rb-orange)' }} />
                    <span className='mn-link-underline-band' style={{ background: 'var(--rb-pink)' }} />
                    <span className='mn-link-underline-band' style={{ background: 'var(--rb-purple)' }} />
                    <span className='mn-link-underline-band' style={{ background: 'var(--rb-blue)' }} />
                  </span>
                ) : null}
              </button>
            </li>
          )
        })}
      </ul>
      <div className='mn-session'>
        {session ? (
          <button
            type='button'
            onClick={() => {
              void signOut({ callbackUrl: '/login' })
            }}
            className='mn-session-button'
            aria-label={`Sign out ${userLabel}`}
          >
            <span className='mn-session-user'>{userLabel}</span>
            <span className='mn-session-sep' aria-hidden='true'>·</span>
            <span className='mn-session-action'>SIGN OUT</span>
          </button>
        ) : null}
      </div>
      {overlay}
    </nav>
  )
}
