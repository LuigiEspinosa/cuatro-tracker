import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TerminalInput } from '../TerminalInput'

afterEach(() => {
  cleanup()
})

describe('TerminalInput rendering', () => {
  it('renders label + input + cursor span', () => {
    render(<TerminalInput name='email' label='EMAIL' />)
    expect(screen.getByText('EMAIL')).toBeInTheDocument()
    expect(screen.getByLabelText('EMAIL')).toBeInTheDocument()
    expect(screen.getByTestId('ti-cursor')).toBeInTheDocument()
  })

  it('label htmlFor links the input via useId when no id prop is provided', () => {
    render(<TerminalInput name='email' label='EMAIL' />)
    const input = screen.getByLabelText('EMAIL') as HTMLInputElement
    const label = screen.getByText('EMAIL') as HTMLLabelElement
    expect(label.htmlFor).toBeTruthy()
    expect(label.htmlFor).toBe(input.id)
  })

  it('explicit id prop overrides the generated id', () => {
    render(<TerminalInput id='custom-id' name='email' label='EMAIL' />)
    const input = screen.getByLabelText('EMAIL') as HTMLInputElement
    expect(input.id).toBe('custom-id')
  })

  it('defaultValue pre-fills the input', () => {
    render(
      <TerminalInput
        name='email'
        label='EMAIL'
        defaultValue='admin@tracker.local'
      />,
    )
    const input = screen.getByLabelText('EMAIL') as HTMLInputElement
    expect(input.value).toBe('admin@tracker.local')
  })

  it('focus flips data-focused on the wrap, blur resets it', () => {
    render(<TerminalInput name='email' label='EMAIL' />)
    const wrap = screen.getByTestId('ti-wrap')
    const input = screen.getByLabelText('EMAIL')

    expect(wrap).toHaveAttribute('data-focused', 'false')
    fireEvent.focus(input)
    expect(wrap).toHaveAttribute('data-focused', 'true')
    fireEvent.blur(input)
    expect(wrap).toHaveAttribute('data-focused', 'false')
  })

  it('reducedMotionOverride=true sets data-rm="true" on the wrap', () => {
    render(
      <TerminalInput name='email' label='EMAIL' reducedMotionOverride={true} />,
    )
    const wrap = screen.getByTestId('ti-wrap')
    expect(wrap).toHaveAttribute('data-rm', 'true')
  })

  it('reducedMotionOverride=false sets data-rm="false" on the wrap', () => {
    render(
      <TerminalInput name='email' label='EMAIL' reducedMotionOverride={false} />,
    )
    const wrap = screen.getByTestId('ti-wrap')
    expect(wrap).toHaveAttribute('data-rm', 'false')
  })

  it('omits data-rm when reducedMotionOverride is not provided', () => {
    render(<TerminalInput name='email' label='EMAIL' />)
    const wrap = screen.getByTestId('ti-wrap')
    expect(wrap).not.toHaveAttribute('data-rm')
  })

  it('type=password renders a password input', () => {
    render(<TerminalInput name='password' label='PASSWORD' type='password' />)
    const input = screen.getByLabelText('PASSWORD') as HTMLInputElement
    expect(input.type).toBe('password')
  })

  it('passes autoComplete and required through to the input', () => {
    render(
      <TerminalInput
        name='email'
        label='EMAIL'
        autoComplete='email'
        required
      />,
    )
    const input = screen.getByLabelText('EMAIL') as HTMLInputElement
    expect(input.autocomplete).toBe('email')
    expect(input.required).toBe(true)
  })
})
