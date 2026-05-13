import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const pathnameRef = { current: '/' as string }
const navigateMock = vi.fn()
const signOutMock = vi.fn()
const sessionMock = { current: null as { user?: { name?: string | null; email?: string | null } } | null }

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
}))

vi.mock('next-auth/react', () => ({
  useSession: () => ({ data: sessionMock.current, status: sessionMock.current ? 'authenticated' : 'unauthenticated' }),
  signOut: (...args: unknown[]) => signOutMock(...args),
}))

vi.mock('@/components/molecules/ChannelFlipTransition', () => ({
  useChannelFlipNavigate: () => ({
    navigate: (target: string) => {
      navigateMock(target)
      return Promise.resolve()
    },
    overlay: null,
  }),
}))

import { MainNav } from '../MainNav'

beforeEach(() => {
  navigateMock.mockReset()
  signOutMock.mockReset()
  pathnameRef.current = '/'
  sessionMock.current = { user: { email: 'admin@tracker.local' } }
})

afterEach(() => {
  cleanup()
})

describe('MainNav rendering (AC-3)', () => {
  it('renders the 4 nav buttons and the LogoMark', () => {
    render(<MainNav />)
    expect(screen.getByRole('img', { name: /cuatro tracker logo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Admin' })).toBeInTheDocument()
  })

  it('hides on /login', () => {
    pathnameRef.current = '/login'
    const { container } = render(<MainNav />)
    expect(container.firstChild).toBeNull()
  })

  it('marks the active route via aria-current=page and renders the rainbow underline', () => {
    pathnameRef.current = '/library'
    render(<MainNav />)
    const libraryButton = screen.getByRole('button', { name: 'Library' })
    expect(libraryButton).toHaveAttribute('aria-current', 'page')
    expect(libraryButton).toHaveClass('mn-link-active')
    const bands = libraryButton.querySelectorAll('.mn-link-underline-band')
    expect(bands).toHaveLength(6)

    const timelineButton = screen.getByRole('button', { name: 'Timeline' })
    expect(timelineButton).not.toHaveAttribute('aria-current')
  })

  it('matches nested route prefixes for the active state', () => {
    pathnameRef.current = '/timeline/2025'
    render(<MainNav />)
    expect(screen.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-current', 'page')
  })

  it('renders the session menu using name then email then placeholder', () => {
    sessionMock.current = { user: { name: 'Cuatro', email: 'admin@tracker.local' } }
    const { rerender } = render(<MainNav />)
    expect(screen.getByText('Cuatro')).toBeInTheDocument()
    expect(screen.queryByText('admin@tracker.local')).not.toBeInTheDocument()

    sessionMock.current = { user: { email: 'admin@tracker.local' } }
    rerender(<MainNav />)
    expect(screen.getByText('admin@tracker.local')).toBeInTheDocument()

    sessionMock.current = { user: {} }
    rerender(<MainNav />)
    expect(screen.getByText('???')).toBeInTheDocument()
  })

  it('hides the session menu when there is no session', () => {
    sessionMock.current = null
    render(<MainNav />)
    expect(screen.queryByText(/sign out/i)).not.toBeInTheDocument()
  })
})

describe('MainNav nav-click integration (AC-4)', () => {
  it('calls useChannelFlipNavigate.navigate with the link target on click', () => {
    render(<MainNav />)
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(navigateMock).toHaveBeenCalledTimes(1)
    expect(navigateMock).toHaveBeenCalledWith('/search')
  })

  it('calls signOut when the session menu is clicked', () => {
    render(<MainNav />)
    const signOutBtn = screen.getByRole('button', { name: /sign out/i })
    fireEvent.click(signOutBtn)
    expect(signOutMock).toHaveBeenCalledTimes(1)
  })
})
