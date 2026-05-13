import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BitmapText } from '../BitmapText'

afterEach(() => {
  cleanup()
})

describe('BitmapText rendering', () => {
  it('renders children with the bt class by default', () => {
    render(<BitmapText>HELLO</BitmapText>)
    const el = screen.getByText('HELLO')
    expect(el).toHaveClass('bt')
    expect(el.tagName).toBe('SPAN')
  })

  it('applies the size prop as inline font-size', () => {
    render(<BitmapText size={30}>BIG</BitmapText>)
    const el = screen.getByText('BIG')
    expect(el).toHaveStyle({ fontSize: '30px' })
  })

  it('tone=cream-dim sets --bt-color to the phosphor-cream-dim token', () => {
    render(<BitmapText tone='cream-dim'>DIM</BitmapText>)
    const el = screen.getByText('DIM')
    expect(el.style.getPropertyValue('--bt-color')).toBe('var(--phosphor-cream-dim)')
  })

  it('tone=magenta sets --bt-color to the magenta token', () => {
    render(<BitmapText tone='magenta'>ERR</BitmapText>)
    const el = screen.getByText('ERR')
    expect(el.style.getPropertyValue('--bt-color')).toBe('var(--magenta)')
  })

  it('glow=true on cream applies the cream text-shadow', () => {
    render(<BitmapText glow>GLOW</BitmapText>)
    const el = screen.getByText('GLOW')
    expect(el).toHaveStyle({ textShadow: '0 0 8px rgba(239, 230, 212, 0.4)' })
  })

  it('glow=true on magenta applies the magenta text-shadow', () => {
    render(
      <BitmapText tone='magenta' glow>
        ALERT
      </BitmapText>,
    )
    const el = screen.getByText('ALERT')
    expect(el).toHaveStyle({ textShadow: '0 0 8px rgba(214, 53, 124, 0.55)' })
  })

  it('as=div renders a div instead of a span', () => {
    render(<BitmapText as='div'>BLOCK</BitmapText>)
    const el = screen.getByText('BLOCK')
    expect(el.tagName).toBe('DIV')
  })

  it('passes the className prop through alongside the bt base', () => {
    render(<BitmapText className='extra'>X</BitmapText>)
    const el = screen.getByText('X')
    expect(el).toHaveClass('bt')
    expect(el).toHaveClass('extra')
  })
})
