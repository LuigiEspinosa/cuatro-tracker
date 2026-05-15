import Image from 'next/image'
import { getImageUrl } from '@/lib/api/tmdb-images'
import type { TmdbCountryProviders } from '@/lib/api/tmdb'

export type StreamingBadgesProps = {
  providers: TmdbCountryProviders
}

type Provider = TmdbCountryProviders['flatrate'][number]

function ProviderRow({ label, items }: { label: string; items: Provider[] }) {
  return (
    <div className='streaming-badges-row'>
      <span className='streaming-badges-row-label'>{label}</span>
      {items.length === 0 ? (
        <span className='streaming-badges-row-empty'>(none)</span>
      ) : (
        <ul className='streaming-badges-row-list'>
          {items.map((provider) => {
            const logo = getImageUrl(provider.logo_path ?? null, 'w92')
            return (
              <li
                key={provider.provider_id}
                className='streaming-badges-chip'
              >
                {logo ? (
                  <Image
                    src={logo}
                    alt={provider.provider_name}
                    width={32}
                    height={32}
                    className='streaming-badges-chip-logo'
                  />
                ) : null}
                <span className='streaming-badges-chip-name'>
                  {provider.provider_name}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function StreamingBadges({ providers }: StreamingBadgesProps) {
  return (
    <div className='streaming-badges'>
      <ProviderRow label='STREAM' items={providers.flatrate} />
      <ProviderRow label='RENT' items={providers.rent} />
      <ProviderRow label='BUY' items={providers.buy} />
    </div>
  )
}
