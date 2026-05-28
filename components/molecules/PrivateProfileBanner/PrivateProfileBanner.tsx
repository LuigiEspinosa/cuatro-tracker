import { StatusBanner } from '@/components/molecules/StatusBanner'

export type PrivateProfileBannerProps = {
  steamProfileUrl?: string
}

export function PrivateProfileBanner({
  steamProfileUrl,
}: PrivateProfileBannerProps) {
  const settingsUrl = steamProfileUrl
    ? `${steamProfileUrl}/edit/settings`
    : 'https://steamcommunity.com/my/edit/settings'
  return (
    <div className='private-profile-banner'>
      <StatusBanner
        variant='warning'
        primary='ACHIEVEMENTS LOCKED'
        secondary='Set your Steam profile to Public to track achievements.'
      />
      <a
        className='private-profile-banner-link'
        href={settingsUrl}
        target='_blank'
        rel='noopener noreferrer'
      >
        OPEN STEAM PRIVACY SETTINGS →
      </a>
    </div>
  )
}
