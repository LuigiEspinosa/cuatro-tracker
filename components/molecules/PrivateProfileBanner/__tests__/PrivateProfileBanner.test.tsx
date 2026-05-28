import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PrivateProfileBanner } from '../PrivateProfileBanner'

describe('PrivateProfileBanner', () => {
  it('renders the warning banner copy and the privacy-settings link', () => {
    render(<PrivateProfileBanner />)
    expect(screen.getByText('ACHIEVEMENTS LOCKED')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Set your Steam profile to Public to track achievements.',
      ),
    ).toBeInTheDocument()
    const link = screen.getByRole('link', {
      name: /OPEN STEAM PRIVACY SETTINGS/i,
    })
    expect(link).toHaveAttribute(
      'href',
      'https://steamcommunity.com/my/edit/settings',
    )
  })

  it('opens the settings link in a new tab without leaking window.opener', () => {
    render(<PrivateProfileBanner />)
    const link = screen.getByRole('link', {
      name: /OPEN STEAM PRIVACY SETTINGS/i,
    })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('appends /edit/settings to a provided steamProfileUrl', () => {
    render(
      <PrivateProfileBanner steamProfileUrl='https://steamcommunity.com/id/cuatro' />,
    )
    const link = screen.getByRole('link', {
      name: /OPEN STEAM PRIVACY SETTINGS/i,
    })
    expect(link).toHaveAttribute(
      'href',
      'https://steamcommunity.com/id/cuatro/edit/settings',
    )
  })

  it('contains no emoji glyphs in the rendered text', () => {
    const { container } = render(<PrivateProfileBanner />)
    const text = container.textContent ?? ''
    // Guard against the lock (U+1F512) and warning-sign (U+26A0) glyphs;
    // the warning semantic is carried by StatusBanner's orange tone, not an emoji.
    expect(text).not.toMatch(/[\u{1F512}\u{26A0}]/u)
  })
})
