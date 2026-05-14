import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import { SearchInput } from '../SearchInput'

describe('SearchInput', () => {
  beforeEach(() => {
    cleanup()
  })

  it('renders SEARCH label + hint + caret + input', () => {
    render(<SearchInput value='' onChange={() => {}} />)

    expect(screen.getByText('SEARCH')).toBeInTheDocument()
    expect(screen.getByText('PRESS ESC TO CLEAR')).toBeInTheDocument()
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('debounces onChange by 175ms by default', () => {
    vi.useFakeTimers()
    try {
      const onChange = vi.fn()
      render(<SearchInput value='' onChange={onChange} />)
      const input = screen.getByRole('searchbox') as HTMLInputElement

      fireEvent.change(input, { target: { value: 'f' } })
      fireEvent.change(input, { target: { value: 'fi' } })
      fireEvent.change(input, { target: { value: 'fig' } })

      expect(onChange).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(170)
      })
      expect(onChange).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(10)
      })
      expect(onChange).toHaveBeenCalledExactlyOnceWith('fig')
    } finally {
      vi.useRealTimers()
    }
  })

  it('flips the hint to DEBOUNCING… while the debounce timer is pending', () => {
    vi.useFakeTimers()
    try {
      render(<SearchInput value='' onChange={() => {}} />)
      const input = screen.getByRole('searchbox')

      fireEvent.change(input, { target: { value: 'foo' } })

      expect(screen.getByText('DEBOUNCING…')).toBeInTheDocument()

      act(() => {
        vi.advanceTimersByTime(180)
      })

      expect(screen.queryByText('DEBOUNCING…')).toBeNull()
      expect(screen.getByText('PRESS ESC TO CLEAR')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('Escape clears the draft and fires onChange("") immediately (no debounce wait)', () => {
    const onChange = vi.fn()
    render(<SearchInput value='fight' onChange={onChange} />)
    const input = screen.getByRole('searchbox') as HTMLInputElement
    expect(input.value).toBe('fight')

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onChange).toHaveBeenCalledExactlyOnceWith('')
    expect(input.value).toBe('')
  })

  it('mirrors external value updates into the draft', () => {
    const { rerender } = render(<SearchInput value='fight' onChange={() => {}} />)
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('fight')

    rerender(<SearchInput value='matrix' onChange={() => {}} />)
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('matrix')
  })

  it('reflects focused state via the data-focused attribute on the wrap', () => {
    const { container } = render(<SearchInput value='' onChange={() => {}} />)
    const wrap = container.querySelector('.si-wrap')
    expect(wrap?.getAttribute('data-focused')).toBe('false')

    fireEvent.focus(screen.getByRole('searchbox'))
    expect(wrap?.getAttribute('data-focused')).toBe('true')

    fireEvent.blur(screen.getByRole('searchbox'))
    expect(wrap?.getAttribute('data-focused')).toBe('false')
  })
})
