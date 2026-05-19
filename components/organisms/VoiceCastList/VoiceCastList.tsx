import Image from 'next/image'
import type { AnilistCharacterEdge } from '@/lib/api/anilist'

export type VoiceCastListProps = {
  characters: AnilistCharacterEdge[]
  /** Maximum visible entries. Defaults to all (the adapter already caps at 12). */
  limit?: number
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export function VoiceCastList({ characters, limit }: VoiceCastListProps) {
  const visible =
    typeof limit === 'number' ? characters.slice(0, limit) : characters
  if (visible.length === 0) return null

  return (
    <ul className='voice-cast-list'>
      {visible.map((edge) => {
        const character = edge.node
        const voice = edge.voiceActors?.[0]
        const portrait = character.image?.medium ?? null
        return (
          <li
            key={`${edge.role}-${character.id}`}
            className='voice-cast-list-item'
          >
            <div className='voice-cast-list-portrait'>
              {portrait ? (
                <Image
                  src={portrait}
                  alt={character.name.full}
                  width={96}
                  height={96}
                  unoptimized
                  className='voice-cast-list-portrait-img'
                />
              ) : (
                <span className='voice-cast-list-portrait-initials'>
                  {initials(character.name.full)}
                </span>
              )}
            </div>
            <span className='voice-cast-list-role'>{edge.role}</span>
            <span className='voice-cast-list-name'>{character.name.full}</span>
            {voice ? (
              <span className='voice-cast-list-voiced-by'>
                voiced by {voice.name.full}
              </span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
