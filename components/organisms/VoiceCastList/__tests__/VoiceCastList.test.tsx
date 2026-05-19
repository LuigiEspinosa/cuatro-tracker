import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VoiceCastList } from '@/components/organisms/VoiceCastList'
import type { AnilistCharacterEdge } from '@/lib/api/anilist'

function edge(
  id: number,
  overrides: Partial<{
    role: string
    characterName: string
    voiceActorName: string | null
    portrait: string | null
  }> = {},
): AnilistCharacterEdge {
  return {
    role: overrides.role ?? 'MAIN',
    voiceActors:
      overrides.voiceActorName === null
        ? []
        : [
            {
              id: id + 1000,
              name: {
                full: overrides.voiceActorName ?? 'Atsumi Tanezaki',
                native: null,
              },
              language: 'JAPANESE',
            },
          ],
    node: {
      id,
      name: {
        full: overrides.characterName ?? `Character ${id}`,
        native: null,
      },
      image:
        overrides.portrait === null
          ? undefined
          : {
              medium:
                overrides.portrait ?? `https://s4.anilist.co/c/${id}.png`,
            },
    },
  }
}

describe('VoiceCastList', () => {
  it('renders nothing when characters is empty', () => {
    const { container } = render(<VoiceCastList characters={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders one row per character with the role chip, name, and voiced-by line', () => {
    render(
      <VoiceCastList
        characters={[
          edge(1, {
            characterName: 'Frieren',
            voiceActorName: 'Atsumi Tanezaki',
          }),
          edge(2, {
            role: 'SUPPORTING',
            characterName: 'Fern',
            voiceActorName: 'Kana Ichinose',
          }),
        ]}
      />,
    )
    expect(screen.getByText('Frieren')).toBeInTheDocument()
    expect(screen.getByText('voiced by Atsumi Tanezaki')).toBeInTheDocument()
    expect(screen.getByText('Fern')).toBeInTheDocument()
    expect(screen.getByText('voiced by Kana Ichinose')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('omits the voiced-by line when voiceActors is empty', () => {
    render(
      <VoiceCastList
        characters={[
          edge(1, { characterName: 'Mystery Character', voiceActorName: null }),
        ]}
      />,
    )
    expect(screen.getByText('Mystery Character')).toBeInTheDocument()
    expect(screen.queryByText(/voiced by/)).not.toBeInTheDocument()
  })

  it('honours `limit` and caps the visible entries', () => {
    const many = Array.from({ length: 20 }, (_, i) => edge(i + 1))
    render(<VoiceCastList characters={many} limit={5} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  it('falls back to initials when the character portrait is missing', () => {
    render(
      <VoiceCastList
        characters={[
          edge(1, { characterName: 'Spike Spiegel', portrait: null }),
        ]}
      />,
    )
    expect(screen.getByText('SS')).toBeInTheDocument()
  })

  it('renders the role chip from the AniList edge (MAIN / SUPPORTING / BACKGROUND)', () => {
    render(
      <VoiceCastList
        characters={[
          edge(1, { role: 'MAIN', characterName: 'A' }),
          edge(2, { role: 'SUPPORTING', characterName: 'B' }),
          edge(3, { role: 'BACKGROUND', characterName: 'C' }),
        ]}
      />,
    )
    expect(screen.getByText('MAIN')).toBeInTheDocument()
    expect(screen.getByText('SUPPORTING')).toBeInTheDocument()
    expect(screen.getByText('BACKGROUND')).toBeInTheDocument()
  })
})
