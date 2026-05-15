import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StreamingBadges } from '../StreamingBadges'

const provider = (id: number, name: string) => ({
  provider_id: id,
  provider_name: name,
  logo_path: '/logo.png',
  display_priority: 0,
})

describe('StreamingBadges', () => {
  it('renders STREAM / RENT / BUY rows with chips', () => {
    render(
      <StreamingBadges
        providers={{
          link: 'https://justwatch.com/link',
          flatrate: [provider(1, 'Netflix')],
          rent: [provider(2, 'Apple TV')],
          buy: [provider(2, 'Apple TV'), provider(3, 'Amazon')],
        }}
      />,
    )
    expect(screen.getByText('STREAM')).toBeInTheDocument()
    expect(screen.getByText('RENT')).toBeInTheDocument()
    expect(screen.getByText('BUY')).toBeInTheDocument()
    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getAllByText('Apple TV')).toHaveLength(2)
    expect(screen.getByText('Amazon')).toBeInTheDocument()
  })

  it('shows (none) when a row has no providers', () => {
    render(
      <StreamingBadges
        providers={{ link: '', flatrate: [], rent: [], buy: [] }}
      />,
    )
    expect(screen.getAllByText('(none)')).toHaveLength(3)
  })
})
