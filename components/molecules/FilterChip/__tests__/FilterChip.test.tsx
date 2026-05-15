import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FilterChip } from '@/components/molecules/FilterChip'

describe('FilterChip', () => {
  it('renders the label in uppercase', () => {
    render(<FilterChip active={false} label='watching' onToggle={() => {}} />)
    expect(screen.getByText('WATCHING')).toBeInTheDocument()
  })

  it('reflects active state via data-active and aria-pressed', () => {
    const { rerender } = render(
      <FilterChip active={false} label='watching' onToggle={() => {}} />,
    )
    const button = screen.getByRole('button')
    expect(button.getAttribute('data-active')).toBe('false')
    expect(button.getAttribute('aria-pressed')).toBe('false')

    rerender(<FilterChip active label='watching' onToggle={() => {}} />)
    expect(button.getAttribute('data-active')).toBe('true')
    expect(button.getAttribute('aria-pressed')).toBe('true')
  })

  it('renders the rainbow underline only when active', () => {
    const { container, rerender } = render(
      <FilterChip active={false} label='watching' onToggle={() => {}} />,
    )
    expect(container.querySelector('.filter-chip-underline')).toBeNull()
    rerender(<FilterChip active label='watching' onToggle={() => {}} />)
    expect(container.querySelector('.filter-chip-underline')).not.toBeNull()
  })

  it('fires onToggle on click', () => {
    const onToggle = vi.fn()
    render(<FilterChip active={false} label='watching' onToggle={onToggle} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('uses the custom aria-label when provided', () => {
    render(
      <FilterChip
        active
        label='watching'
        onToggle={() => {}}
        ariaLabel='Filter: status watching (active)'
      />,
    )
    expect(
      screen.getByLabelText('Filter: status watching (active)'),
    ).toBeInTheDocument()
  })
})
