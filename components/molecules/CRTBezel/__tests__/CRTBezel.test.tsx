import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CRTBezel } from '../CRTBezel'

afterEach(() => {
  cleanup()
})

describe('CRTBezel rendering', () => {
  it('renders an svg with viewBox 0 0 800 600', () => {
    const { container } = render(
      <CRTBezel>
        <span>inside</span>
      </CRTBezel>,
    )
    const svg = container.querySelector('svg.crt-shell')
    expect(svg).not.toBeNull()
    expect(svg).toHaveAttribute('viewBox', '0 0 800 600')
  })

  it('the outer .crt div carries the bg-noise utility', () => {
    const { container } = render(
      <CRTBezel>
        <span>x</span>
      </CRTBezel>,
    )
    const outer = container.querySelector('.crt')
    expect(outer).not.toBeNull()
    expect(outer).toHaveClass('bg-noise')
  })

  it('renders the embossed CUATRO chin wordmark (twice for the embossed shadow)', () => {
    const { container } = render(
      <CRTBezel>
        <span>x</span>
      </CRTBezel>,
    )
    const wordmarks = container.querySelectorAll('text')
    const cuatroTexts = Array.from(wordmarks).filter((t) =>
      t.textContent === 'CUATRO',
    )
    expect(cuatroTexts.length).toBe(2)
  })

  it('renders the power LED as two circles + a PWR label', () => {
    const { container } = render(
      <CRTBezel>
        <span>x</span>
      </CRTBezel>,
    )
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(2)
    const pwrLabel = Array.from(container.querySelectorAll('text')).find(
      (t) => t.textContent === 'PWR',
    )
    expect(pwrLabel).toBeDefined()
  })

  it('children render inside the .crt-screen-wrap slot', () => {
    render(
      <CRTBezel>
        <p>SCREEN CONTENT</p>
      </CRTBezel>,
    )
    const wrap = screen.getByTestId('crt-screen-wrap')
    expect(wrap).toHaveClass('crt-screen-wrap')
    expect(wrap.textContent).toBe('SCREEN CONTENT')
  })

  it('does NOT render the bundle internal grain filter (stripped per OI #10)', () => {
    const { container } = render(
      <CRTBezel>
        <span>x</span>
      </CRTBezel>,
    )
    const grainFilter = container.querySelector('filter#grain')
    expect(grainFilter).toBeNull()
  })

  it('default size renders data-size="login" on the outer div', () => {
    const { container } = render(
      <CRTBezel>
        <span>x</span>
      </CRTBezel>,
    )
    const outer = container.querySelector('.crt')
    expect(outer).toHaveAttribute('data-size', 'login')
  })

  it('size="hero" renders data-size="hero" on the outer div', () => {
    const { container } = render(
      <CRTBezel size='hero'>
        <span>x</span>
      </CRTBezel>,
    )
    const outer = container.querySelector('.crt')
    expect(outer).toHaveAttribute('data-size', 'hero')
  })
})
