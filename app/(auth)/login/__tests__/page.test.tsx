import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { signInMock, pushMock, refreshMock, navigateMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
  navigateMock: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  signIn: signInMock,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

vi.mock('@/components/molecules/ChannelFlipTransition/useChannelFlipNavigate', () => ({
  useChannelFlipNavigate: () => ({ navigate: navigateMock, overlay: null }),
}))

vi.mock('@/components/molecules/BootSequence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/molecules/BootSequence')>()
  const React = await import('react')
  return {
    ...actual,
    BootSequence: ({
      onComplete,
      onTruncate,
      holdReleased,
      holdAtFrame,
      truncate,
      reducedMotionOverride,
    }: {
      onComplete: () => void
      onTruncate?: () => void
      holdReleased?: boolean
      holdAtFrame?: number
      truncate?: boolean
      reducedMotionOverride?: boolean
    }) => {
      const shouldFireComplete =
        !truncate &&
        (typeof holdAtFrame === 'number'
          ? holdReleased === true
          : reducedMotionOverride === true || holdReleased === true)
      React.useEffect(() => {
        if (shouldFireComplete) onComplete()
      }, [shouldFireComplete, onComplete])
      React.useEffect(() => {
        if (!truncate) return
        if (!onTruncate) return
        const id = setTimeout(() => onTruncate(), 0)
        return () => clearTimeout(id)
      }, [truncate, onTruncate])
      return <div role='status' aria-label='System boot sequence' data-mock='true' />
    },
  }
})

import LoginPage from '../page'

beforeEach(() => {
  signInMock.mockReset()
  pushMock.mockReset()
  refreshMock.mockReset()
  navigateMock.mockReset()
  navigateMock.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('LoginPage submit flow', () => {
  it('submits the form with email + password and the credentials provider shape', async () => {
    signInMock.mockResolvedValue({ ok: true, error: null })
    render(<LoginPage />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    const password = screen.getByLabelText('PASSWORD') as HTMLInputElement
    fireEvent.change(password, { target: { value: 'adminpass' } })
    fireEvent.submit(email.closest('form')!)

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith('credentials', {
        email: 'admin@tracker.local',
        password: 'adminpass',
        redirect: false,
      })
    })
  })

  it('on error: enters error-truncating phase then settles to idle with the > ACCESS DENIED banner; does NOT navigate', async () => {
    signInMock.mockResolvedValue({ ok: false, error: 'CredentialsSignin' })
    render(<LoginPage />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    fireEvent.submit(email.closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('> ACCESS DENIED')).toBeInTheDocument()
    })
    expect(screen.getByText('INVALID EMAIL OR PASSWORD')).toBeInTheDocument()
    expect(navigateMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('on error: the submit button is re-enabled after the round-trip', async () => {
    signInMock.mockResolvedValue({ ok: false, error: 'CredentialsSignin' })
    render(<LoginPage />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    fireEvent.submit(email.closest('form')!)

    await waitFor(() => {
      const btn = screen.getByRole('button', {
        name: '> LOG IN',
      }) as HTMLButtonElement
      expect(btn.disabled).toBe(false)
    })
  })

  it('on error: focus moves to the password field for retry', async () => {
    signInMock.mockResolvedValue({ ok: false, error: 'CredentialsSignin' })
    render(<LoginPage />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    fireEvent.submit(email.closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('> ACCESS DENIED')).toBeInTheDocument()
    })
    expect(document.activeElement).toBe(screen.getByLabelText('PASSWORD'))
  })

  it('on error: form values are retained (email defaultValue + typed password)', async () => {
    signInMock.mockResolvedValue({ ok: false, error: 'CredentialsSignin' })
    render(<LoginPage />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    const password = screen.getByLabelText('PASSWORD') as HTMLInputElement
    fireEvent.change(password, { target: { value: 'wrong-pass' } })
    fireEvent.submit(email.closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('> ACCESS DENIED')).toBeInTheDocument()
    })
    expect(email.value).toBe('admin@tracker.local')
    expect(password.value).toBe('wrong-pass')
  })

  it('on success: flips phase to pending then success and waits for boot before navigating', async () => {
    signInMock.mockResolvedValue({ ok: true, error: null })
    render(<LoginPage />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    const submitForm = email.closest('form')!

    expect(
      screen.queryByRole('status', { name: /system boot sequence/i }),
    ).not.toBeInTheDocument()

    fireEvent.submit(submitForm)

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(
        screen.getByRole('status', { name: /system boot sequence/i }),
      ).toBeInTheDocument()
    })
  })

  it('on success: onBootComplete triggers navigate(/) then router.refresh()', async () => {
    signInMock.mockResolvedValue({ ok: true, error: null })
    render(<LoginPage />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    fireEvent.submit(email.closest('form')!)

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/')
    }, { timeout: 3000 })
    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('AC-3 slow-auth: boot mounts before signIn resolves and navigate fires only AFTER auth succeeds', async () => {
    let resolveSignIn!: (value: { ok: boolean; error: null }) => void
    signInMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve
        }),
    )
    render(<LoginPage />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    fireEvent.submit(email.closest('form')!)

    await waitFor(() => {
      expect(
        screen.getByRole('status', { name: /system boot sequence/i }),
      ).toBeInTheDocument()
    })
    expect(navigateMock).not.toHaveBeenCalled()

    resolveSignIn({ ok: true, error: null })

    await waitFor(
      () => {
        expect(navigateMock).toHaveBeenCalledWith('/')
      },
      { timeout: 3000 },
    )
  })
})
