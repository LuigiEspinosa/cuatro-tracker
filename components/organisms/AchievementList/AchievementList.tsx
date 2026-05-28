import Image from 'next/image'
import { PhosphorBar } from '@/components/atoms/PhosphorBar'

export type AchievementListItem = {
  id: string
  steam_api_name: string
  display_name: string
  description: string | null
  icon_url: string | null
  unlocked: boolean
  unlocked_at: Date | null
  percent_global: number | null
}

export type AchievementListProps = {
  achievements: AchievementListItem[]
  // gameId is reserved for a future per-row Steam-deeplink action; today the
  // list is a pure read so it is intentionally not consumed in the render.
  gameId: string
}

type RarityChip = { label: string; tone: 'rare' | 'uncommon' | 'common' }

function rarityChip(pct: number | null): RarityChip | null {
  if (pct === null) return null
  if (pct < 10) return { label: 'RARE', tone: 'rare' }
  if (pct < 50) return { label: 'UNCOMMON', tone: 'uncommon' }
  // Covers >= 50 and the >= 100 soft-clamp (Steam can report slightly above 100
  // on small player populations; there is no CHECK constraint per Q-CHECK).
  return { label: 'COMMON', tone: 'common' }
}

function formatUnlockedDate(d: Date | null): string | null {
  if (d === null) return null
  return d.toISOString().slice(0, 10)
}

function AchievementRow({ item }: { item: AchievementListItem }) {
  const rarity = rarityChip(item.percent_global)
  const unlockedDate = formatUnlockedDate(item.unlocked_at)
  return (
    <li
      className='achievement-list-row'
      data-unlocked={String(item.unlocked)}
      data-rarity={rarity?.tone ?? 'none'}
    >
      {item.icon_url ? (
        <Image
          className='achievement-list-row-icon'
          src={item.icon_url}
          width={24}
          height={24}
          alt=''
        />
      ) : (
        <span className='achievement-list-row-icon-placeholder' aria-hidden='true' />
      )}
      <div className='achievement-list-row-text'>
        <p className='achievement-list-row-name'>{item.display_name}</p>
        {item.description ? (
          <p className='achievement-list-row-desc'>{item.description}</p>
        ) : null}
      </div>
      {unlockedDate ? (
        <span className='achievement-list-row-date'>{unlockedDate}</span>
      ) : null}
      {rarity ? (
        <span className='achievement-list-row-rarity'>{rarity.label}</span>
      ) : null}
    </li>
  )
}

export function AchievementList({ achievements }: AchievementListProps) {
  if (achievements.length === 0) {
    return (
      <p className='achievement-list-empty'>
        &gt; NO ACHIEVEMENTS FOR THIS GAME
      </p>
    )
  }

  const unlocked = achievements.filter((a) => a.unlocked)
  const locked = achievements.filter((a) => !a.unlocked)
  const pct = Math.round((unlocked.length / achievements.length) * 100)

  return (
    <div className='achievement-list'>
      <div className='achievement-list-summary'>
        {unlocked.length} / {achievements.length} · {pct}%
      </div>
      <PhosphorBar
        value={unlocked.length}
        max={achievements.length}
        label={`${unlocked.length} / ${achievements.length} achievements unlocked`}
      />
      {unlocked.length > 0 ? (
        <section className='achievement-list-section' data-state='unlocked'>
          <h3 className='achievement-list-section-title'>
            UNLOCKED ({unlocked.length})
          </h3>
          <ul>
            {unlocked.map((a) => (
              <AchievementRow key={a.id} item={a} />
            ))}
          </ul>
        </section>
      ) : null}
      {locked.length > 0 ? (
        <section className='achievement-list-section' data-state='locked'>
          <h3 className='achievement-list-section-title'>
            LOCKED ({locked.length})
          </h3>
          <ul>
            {locked.map((a) => (
              <AchievementRow key={a.id} item={a} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
