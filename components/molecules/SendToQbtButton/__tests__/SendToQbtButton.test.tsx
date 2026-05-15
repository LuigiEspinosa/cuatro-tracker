import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SendToQbtButton } from '../SendToQbtButton'

const toastMock = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: toastMock }))

describe('SendToQbtButton', () => {
  it('renders the SEND TO qBT label with a bitmap play glyph', () => {
    const { container } = render(<SendToQbtButton />)
    expect(screen.getByRole('button')).toHaveTextContent('SEND TO qBT')
    expect(container.querySelector('svg.send-to-qbt-glyph')).toBeTruthy()
  })

  it('fires the deferred-toast on click', async () => {
    const user = userEvent.setup()
    render(<SendToQbtButton />)
    await user.click(screen.getByRole('button'))
    expect(toastMock).toHaveBeenCalledWith('qBT WIRING DEFERRED TO E12')
  })
})
