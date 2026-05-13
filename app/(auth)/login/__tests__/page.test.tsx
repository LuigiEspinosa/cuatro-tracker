import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { signInMock, pushMock, refreshMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
  pushMock: vi.fn(),
  refreshMock: vi.fn(),
}))

vi.mock('next-auth/react', () => ({
  signIn: signInMock,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

import LoginPage from '../page'

beforeEach(() => {
  signInMock.mockReset()
  pushMock.mockReset()
  refreshMock.mockReset()
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

  it('on success: routes to / and refreshes', async () => {
    signInMock.mockResolvedValue({ ok: true, error: null })
    render(<LoginPage />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    fireEvent.submit(email.closest('form')!)

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/')
      expect(refreshMock).toHaveBeenCalled()
    })
  })

  it('on error: renders the Invalid email or password. line and does NOT navigate', async () => {
    signInMock.mockResolvedValue({ ok: false, error: 'CredentialsSignin' })
    render(<LoginPage />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    fireEvent.submit(email.closest('form')!)

    await waitFor(() => {
      expect(
        screen.getByText('Invalid email or password.'),
      ).toBeInTheDocument()
    })
    expect(pushMock).not.toHaveBeenCalled()
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
})
