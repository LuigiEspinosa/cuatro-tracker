import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EpisodeWatchToggle } from '@/components/molecules/EpisodeWatchToggle'

describe('EpisodeWatchToggle', () => {
  it('renders an accessible role=checkbox with aria-checked matching the prop', () => {
    render(
      <EpisodeWatchToggle
        checked={true}
        label='Mark S1E1 watched'
        onToggle={vi.fn()}
      />,
    )
    const box = screen.getByRole('checkbox', { name: 'Mark S1E1 watched' })
    expect(box.getAttribute('aria-checked')).toBe('true')
    expect(box.getAttribute('data-checked')).toBe('true')
  })

  it('fires onToggle when clicked', () => {
    const onToggle = vi.fn()
    render(
      <EpisodeWatchToggle
        checked={false}
        label='Mark S1E1 watched'
        onToggle={onToggle}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire onToggle when disabled, shows the UNAIRED tooltip', () => {
    const onToggle = vi.fn()
    render(
      <EpisodeWatchToggle
        checked={false}
        disabled
        label='Mark unaired episode'
        onToggle={onToggle}
      />,
    )
    const box = screen.getByRole('checkbox', { hidden: true })
    expect(box.getAttribute('aria-disabled')).toBe('true')
    expect(box.getAttribute('title')).toBe('UNAIRED — CANNOT MARK WATCHED')
    fireEvent.click(box)
    expect(onToggle).not.toHaveBeenCalled()
  })
})
