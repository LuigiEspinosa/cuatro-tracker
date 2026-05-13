import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LogoMark } from '../LogoMark'

describe('LogoMark', () => {
  it('renders 3 rainbow blocks and the wordmark', () => {
    render(<LogoMark />)
    expect(screen.getByRole('img', { name: /cuatro tracker logo/i })).toBeInTheDocument()
    expect(screen.getByText('CUATRO TRACKER')).toBeInTheDocument()
    const blocks = document.querySelectorAll('.lm-block')
    expect(blocks).toHaveLength(3)
  })

  it('accepts a custom className', () => {
    render(<LogoMark className='custom-class' />)
    const logo = screen.getByRole('img', { name: /cuatro tracker logo/i })
    expect(logo).toHaveClass('lm')
    expect(logo).toHaveClass('custom-class')
  })
})
