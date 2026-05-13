import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginCRT } from '../LoginCRT'

afterEach(() => {
  cleanup()
})

describe('LoginCRT rendering', () => {
  it('renders the bitmap header, version line, copyright, and submit button', () => {
    render(<LoginCRT onSubmit={vi.fn()} />)
    expect(screen.getByText('CUATRO TRACKER')).toBeInTheDocument()
    expect(screen.getByText('VERSION 0.2.0')).toBeInTheDocument()
    expect(
      screen.getByText('(C) CUATRO DEVELOPMENT STUDIO, 2026. ALL RIGHTS RESERVED.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '> LOG IN' })).toBeInTheDocument()
  })

  it('renders email + password inputs with their labels', () => {
    render(<LoginCRT onSubmit={vi.fn()} />)
    expect(screen.getByLabelText('EMAIL')).toBeInTheDocument()
    expect(screen.getByLabelText('PASSWORD')).toBeInTheDocument()
  })

  it('email defaults to admin@tracker.local (AC-5)', () => {
    render(<LoginCRT onSubmit={vi.fn()} />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    expect(email.value).toBe('admin@tracker.local')
  })

  it('defaultEmail prop overrides the default value', () => {
    render(<LoginCRT onSubmit={vi.fn()} defaultEmail='someone@example.com' />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    expect(email.value).toBe('someone@example.com')
  })

  it('submit invokes onSubmit with the current form values', () => {
    const onSubmit = vi.fn()
    render(<LoginCRT onSubmit={onSubmit} />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    const password = screen.getByLabelText('PASSWORD') as HTMLInputElement
    fireEvent.change(email, { target: { value: 'a@b.c' } })
    fireEvent.change(password, { target: { value: 'pw' } })
    fireEvent.submit(email.closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith({ email: 'a@b.c', password: 'pw' })
  })

  it('pending=true disables the submit button', () => {
    render(<LoginCRT onSubmit={vi.fn()} pending={true} />)
    const btn = screen.getByRole('button', { name: '> LOG IN' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('pending=false leaves the submit button enabled', () => {
    render(<LoginCRT onSubmit={vi.fn()} pending={false} />)
    const btn = screen.getByRole('button', { name: '> LOG IN' }) as HTMLButtonElement
    expect(btn.disabled).toBe(false)
  })

  it('error string renders the StatusBanner with > ACCESS DENIED + INVALID EMAIL OR PASSWORD', () => {
    render(
      <LoginCRT onSubmit={vi.fn()} error='Invalid email or password.' />,
    )
    const banner = screen.getByRole('alert')
    expect(banner).toHaveAttribute('data-variant', 'error')
    expect(banner).toHaveClass('sb')
    expect(screen.getByText('> ACCESS DENIED')).toBeInTheDocument()
    expect(screen.getByText('INVALID EMAIL OR PASSWORD')).toBeInTheDocument()
  })

  it('null/undefined error does NOT render the StatusBanner', () => {
    render(<LoginCRT onSubmit={vi.fn()} error={null} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('threads reducedMotionOverride to both TerminalInputs', () => {
    render(<LoginCRT onSubmit={vi.fn()} reducedMotionOverride={true} />)
    const wraps = screen.getAllByTestId('ti-wrap')
    expect(wraps).toHaveLength(2)
    wraps.forEach((w) => expect(w).toHaveAttribute('data-rm', 'true'))
  })

  it('pending=true blocks form-level submit (Enter key) from invoking onSubmit again', () => {
    const onSubmit = vi.fn()
    render(<LoginCRT onSubmit={onSubmit} pending={true} />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    fireEvent.submit(email.closest('form')!)
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('LoginCRT phase prop (Story 3.2)', () => {
  it('phase=idle does NOT mount the boot overlay', () => {
    render(<LoginCRT onSubmit={vi.fn()} phase='idle' />)
    expect(
      screen.queryByRole('status', { name: /system boot sequence/i }),
    ).not.toBeInTheDocument()
  })

  it('phase=pending mounts the boot overlay AND applies lc-form-faded to the form', () => {
    render(<LoginCRT onSubmit={vi.fn()} phase='pending' reducedMotionOverride={true} />)
    expect(
      screen.getByRole('status', { name: /system boot sequence/i }),
    ).toBeInTheDocument()
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    expect(email.closest('form')).toHaveClass('lc-form-faded')
  })

  it('phase=pending disables the submit button', () => {
    render(<LoginCRT onSubmit={vi.fn()} phase='pending' reducedMotionOverride={true} />)
    const btn = screen.getByRole('button', { name: '> LOG IN' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('phase=pending blocks form-level submit (Enter key) from re-invoking onSubmit', () => {
    const onSubmit = vi.fn()
    render(<LoginCRT onSubmit={onSubmit} phase='pending' reducedMotionOverride={true} />)
    const email = screen.getByLabelText('EMAIL') as HTMLInputElement
    fireEvent.submit(email.closest('form')!)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('phase=success keeps the boot mounted with holdReleased=true (renders welcome line under reduced-motion)', () => {
    render(<LoginCRT onSubmit={vi.fn()} phase='success' reducedMotionOverride={true} />)
    expect(
      screen.getByRole('status', { name: /system boot sequence/i }),
    ).toBeInTheDocument()
  })

  it('passes channelFlipOverlay slot content into the bezel', () => {
    render(
      <LoginCRT
        onSubmit={vi.fn()}
        phase='success'
        reducedMotionOverride={true}
        channelFlipOverlay={<div data-testid='flip-overlay' />}
      />,
    )
    expect(screen.getByTestId('flip-overlay')).toBeInTheDocument()
  })
})

describe('LoginCRT error-truncating phase + StatusBanner (Story 3.3)', () => {
  it('phase=error-truncating applies the shake class to .lc-screen and keeps the boot mounted with truncate=true', () => {
    const { container } = render(
      <LoginCRT
        onSubmit={vi.fn()}
        phase='error-truncating'
        reducedMotionOverride={true}
      />,
    )
    expect(container.querySelector('.lc-screen-shake')).not.toBeNull()
    const boot = screen.getByRole('status', { name: /system boot sequence/i })
    expect(boot).toHaveClass('bs-truncating')
  })

  it('phase=error-truncating does NOT render the StatusBanner (banner appears after onBootTruncate flips phase to idle)', () => {
    render(
      <LoginCRT
        onSubmit={vi.fn()}
        phase='error-truncating'
        error='Invalid email or password.'
        reducedMotionOverride={true}
      />,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('phase=idle + error string renders StatusBanner with > ACCESS DENIED + INVALID EMAIL OR PASSWORD', () => {
    render(
      <LoginCRT
        onSubmit={vi.fn()}
        phase='idle'
        error='Invalid email or password.'
      />,
    )
    const banner = screen.getByRole('alert')
    expect(banner).toHaveAttribute('data-variant', 'error')
    expect(screen.getByText('> ACCESS DENIED')).toBeInTheDocument()
    expect(screen.getByText('INVALID EMAIL OR PASSWORD')).toBeInTheDocument()
  })

  it('focus moves to the password field on the null → error transition', () => {
    const { rerender } = render(
      <LoginCRT onSubmit={vi.fn()} phase='idle' error={null} />,
    )
    expect(document.activeElement).not.toBe(screen.getByLabelText('PASSWORD'))

    rerender(
      <LoginCRT
        onSubmit={vi.fn()}
        phase='idle'
        error='Invalid email or password.'
      />,
    )
    expect(document.activeElement).toBe(screen.getByLabelText('PASSWORD'))
  })

  it('the original BitmapText magenta error line is REMOVED in favor of StatusBanner', () => {
    render(
      <LoginCRT
        onSubmit={vi.fn()}
        phase='idle'
        error='Invalid email or password.'
      />,
    )
    expect(
      screen.queryByText('Invalid email or password.'),
    ).not.toBeInTheDocument()
  })
})
