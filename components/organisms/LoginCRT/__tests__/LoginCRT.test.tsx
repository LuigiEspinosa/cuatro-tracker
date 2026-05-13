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

  it('error string renders the magenta error line', () => {
    render(
      <LoginCRT onSubmit={vi.fn()} error='Invalid email or password.' />,
    )
    const errorLine = screen.getByText('Invalid email or password.')
    expect(errorLine).toBeInTheDocument()
    expect(errorLine).toHaveClass('lc-error')
    expect(errorLine.style.getPropertyValue('--bt-color')).toBe('var(--magenta)')
  })

  it('null/undefined error does NOT render the error line', () => {
    render(<LoginCRT onSubmit={vi.fn()} error={null} />)
    expect(
      screen.queryByText('Invalid email or password.'),
    ).not.toBeInTheDocument()
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
