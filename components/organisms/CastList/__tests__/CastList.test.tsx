import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CastList } from '../CastList'

describe('CastList', () => {
  it('renders one item per person', () => {
    render(
      <CastList
        people={[
          { name: 'Edward Norton', role: 'The Narrator', profilePath: null },
          { name: 'Brad Pitt', role: 'Tyler Durden', profilePath: null },
        ]}
      />,
    )
    expect(screen.getByText('Edward Norton')).toBeInTheDocument()
    expect(screen.getByText('The Narrator')).toBeInTheDocument()
    expect(screen.getByText('Brad Pitt')).toBeInTheDocument()
  })

  it('caps the visible entries at `limit` when supplied', () => {
    const people = Array.from({ length: 20 }).map((_, i) => ({
      name: `Person ${i + 1}`,
      role: 'Role',
      profilePath: null,
    }))
    render(<CastList people={people} limit={12} />)
    expect(screen.getAllByText(/^Person/)).toHaveLength(12)
  })

  it('falls back to initials when profilePath is null', () => {
    render(
      <CastList
        people={[{ name: 'Edward Norton', role: '', profilePath: null }]}
      />,
    )
    expect(screen.getByText('EN')).toBeInTheDocument()
  })
})
