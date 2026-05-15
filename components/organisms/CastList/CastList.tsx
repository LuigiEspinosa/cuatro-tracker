import Image from 'next/image'
import { getImageUrl } from '@/lib/api/tmdb-images'

export type CastPerson = {
  name: string
  role: string
  profilePath: string | null
}

export type CastListProps = {
  people: CastPerson[]
  /** Maximum visible entries. Defaults to all. */
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

export function CastList({ people, limit }: CastListProps) {
  const visible = typeof limit === 'number' ? people.slice(0, limit) : people
  return (
    <ul className='cast-list'>
      {visible.map((person, idx) => {
        const src = getImageUrl(person.profilePath, 'w185')
        return (
          <li key={`${person.name}-${idx}`} className='cast-list-item'>
            <div className='cast-list-portrait'>
              {src ? (
                <Image
                  src={src}
                  alt={person.name}
                  width={96}
                  height={96}
                  className='cast-list-portrait-img'
                />
              ) : (
                <span className='cast-list-portrait-initials'>
                  {initials(person.name)}
                </span>
              )}
            </div>
            <span className='cast-list-name'>{person.name}</span>
            {person.role ? (
              <span className='cast-list-role'>{person.role}</span>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
