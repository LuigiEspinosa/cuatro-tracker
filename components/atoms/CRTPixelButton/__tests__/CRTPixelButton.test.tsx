import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CRTPixelButton } from '../CRTPixelButton'

afterEach(() => {
  cleanup()
})

describe('CRTPixelButton rendering', () => {
  it('renders children with the cpb class', () => {
    render(<CRTPixelButton>{'> LOG IN'}</CRTPixelButton>)
    const btn = screen.getByRole('button', { name: '> LOG IN' })
    expect(btn).toHaveClass('cpb')
  })

  it('default type is button', () => {
    render(<CRTPixelButton>X</CRTPixelButton>)
    const btn = screen.getByRole('button', { name: 'X' }) as HTMLButtonElement
    expect(btn.type).toBe('button')
  })

  it('type=submit propagates to the underlying button', () => {
    render(<CRTPixelButton type='submit'>SUBMIT</CRTPixelButton>)
    const btn = screen.getByRole('button', { name: 'SUBMIT' }) as HTMLButtonElement
    expect(btn.type).toBe('submit')
  })

  it('disabled=true sets the disabled attribute', () => {
    render(<CRTPixelButton disabled>X</CRTPixelButton>)
    const btn = screen.getByRole('button', { name: 'X' }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('click handler fires when not disabled', () => {
    const onClick = vi.fn()
    render(<CRTPixelButton onClick={onClick}>GO</CRTPixelButton>)
    fireEvent.click(screen.getByRole('button', { name: 'GO' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('click handler does not fire when disabled', () => {
    const onClick = vi.fn()
    render(
      <CRTPixelButton disabled onClick={onClick}>
        NOPE
      </CRTPixelButton>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'NOPE' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('fullWidth=false sets data-inline="true"', () => {
    render(<CRTPixelButton fullWidth={false}>X</CRTPixelButton>)
    const btn = screen.getByRole('button', { name: 'X' })
    expect(btn).toHaveAttribute('data-inline', 'true')
  })

  it('fullWidth=true (default) omits data-inline', () => {
    render(<CRTPixelButton>X</CRTPixelButton>)
    const btn = screen.getByRole('button', { name: 'X' })
    expect(btn).not.toHaveAttribute('data-inline')
  })
})
