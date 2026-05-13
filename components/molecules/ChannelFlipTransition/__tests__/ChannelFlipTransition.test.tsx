import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChannelFlipTransition } from '../ChannelFlipTransition'

afterEach(() => {
  cleanup()
})

describe('ChannelFlipTransition rendering', () => {
  it('renders null at progress=0 (no DOM cost when idle)', () => {
    const { container } = render(<ChannelFlipTransition progress={0} />)
    expect(container.firstChild).toBeNull()
    expect(document.querySelector('.cft')).toBeNull()
  })

  it('renders null at negative progress', () => {
    const { container } = render(<ChannelFlipTransition progress={-0.5} />)
    expect(container.firstChild).toBeNull()
    expect(document.querySelector('.cft')).toBeNull()
  })

  it('renders overlay into document.body at progress > 0', () => {
    render(<ChannelFlipTransition progress={0.5} />)
    const overlay = document.body.querySelector('.cft')
    expect(overlay).not.toBeNull()
    expect(overlay?.parentElement).toBe(document.body)
  })

  it('black slab height matches progress * 100%', () => {
    render(<ChannelFlipTransition progress={0.25} />)
    const blackSlab = document.body.querySelector('.cft-black-above') as HTMLElement
    expect(blackSlab.style.height).toBe('25%')
  })

  it('band positioned at top: progress * 100%', () => {
    render(<ChannelFlipTransition progress={0.75} />)
    const band = document.body.querySelector('.cft-band') as HTMLElement
    expect(band.style.top).toBe('75%')
  })

  it('clamps progress > 1 to 100%', () => {
    render(<ChannelFlipTransition progress={1.5} />)
    const blackSlab = document.body.querySelector('.cft-black-above') as HTMLElement
    expect(blackSlab.style.height).toBe('100%')
  })

  it('overlay carries aria-hidden=true and role=presentation', () => {
    render(<ChannelFlipTransition progress={0.5} />)
    const overlay = document.body.querySelector('.cft')
    expect(overlay?.getAttribute('aria-hidden')).toBe('true')
    expect(overlay?.getAttribute('role')).toBe('presentation')
  })
})
