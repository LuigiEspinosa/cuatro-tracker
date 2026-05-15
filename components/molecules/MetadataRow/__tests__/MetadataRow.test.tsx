import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MetadataRow } from '../MetadataRow'

describe('MetadataRow', () => {
  it('renders each item and pipe separators between them', () => {
    render(
      <MetadataRow
        items={[
          { value: '139 MIN' },
          { value: 'DAVID FINCHER' },
          { value: '1999' },
        ]}
      />,
    )
    expect(screen.getByText('139 MIN')).toBeInTheDocument()
    expect(screen.getByText('DAVID FINCHER')).toBeInTheDocument()
    expect(screen.getByText('1999')).toBeInTheDocument()
    // 3 items → 2 separators
    const seps = screen.getAllByText('·', { selector: '.metadata-row-sep' })
    expect(seps.length).toBe(2)
  })

  it('applies the dim attribute to dim items', () => {
    render(
      <MetadataRow
        items={[
          { value: 'RUNTIME' },
          { value: 'RELEASED', dim: true },
        ]}
      />,
    )
    expect(screen.getByText('RUNTIME')).toHaveAttribute('data-dim', 'false')
    expect(screen.getByText('RELEASED')).toHaveAttribute('data-dim', 'true')
  })

  it('renders no separators with a single item', () => {
    const { container } = render(<MetadataRow items={[{ value: 'SOLO' }]} />)
    expect(container.querySelector('.metadata-row-sep')).toBeNull()
  })
})
