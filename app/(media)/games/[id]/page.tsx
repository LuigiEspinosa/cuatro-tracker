import type { ReactNode } from 'react'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { MediaType } from '@prisma/client'
import { db } from '@/lib/db'
import { findUserEntryByMediaItemId } from '@/lib/db/library'
import { getGame, IgdbApiError, type IgdbGame } from '@/lib/api/igdb'
import { getGameImageUrl } from '@/lib/api/igdb-images'
import { deriveDisplayYear } from '@/lib/normalise/release-date'
import { logger } from '@/lib/logger'
import { BackToLibraryLink } from '@/components/molecules/BackToLibraryLink'
import { DetailHero } from '@/components/organisms/DetailHero'
import { SectionBand } from '@/components/organisms/SectionBand/SectionBand'
import { StatusBanner } from '@/components/molecules/StatusBanner'
import { PrivateProfileBanner } from '@/components/molecules/PrivateProfileBanner'
import {
  AchievementList,
  type AchievementListItem,
} from '@/components/organisms/AchievementList'
import type { MetadataItem } from '@/components/molecules/MetadataRow'

export const dynamic = 'force-dynamic'

type PageParams = Promise<{ id: string }>

export async function generateMetadata({
  params,
}: {
  params: PageParams
}): Promise<{ title: string }> {
  const { id } = await params
  const entry = await findUserEntryByMediaItemId(id)
  if (!entry) return { title: 'NOT IN LIBRARY · Cuatro Tracker' }
  return {
    title: `${entry.media_item.title.toUpperCase()} · Cuatro Tracker`,
  }
}

async function resolveIgdbGame(igdbId: number): Promise<IgdbGame | null> {
  try {
    return await getGame(igdbId)
  } catch (err) {
    if (err instanceof IgdbApiError) {
      logger.warn(
        { event: 'game_detail.igdb_unavailable', igdbId, err },
        'IGDB getGame failed; game detail degrades to DB-only metadata',
      )
      return null
    }
    throw err
  }
}

function renderAchievementSection(
  syncStatus: string,
  achievements: AchievementListItem[],
  gameId: string,
): ReactNode {
  switch (syncStatus) {
    case 'private_profile':
      return (
        <>
          <PrivateProfileBanner />
          <section className='game-detail-private-placeholder'>
            <p className='achievement-list-empty'>
              &gt; WAITING FOR FIRST SYNC AFTER PROFILE GOES PUBLIC
            </p>
          </section>
        </>
      )
    case 'never_synced':
      return (
        <>
          <StatusBanner
            variant='info'
            primary='ACHIEVEMENTS NOT YET SYNCED'
            secondary='Next Steam sync runs every 6 hours.'
          />
          <p className='achievement-list-empty'>&gt; SYNC PENDING</p>
        </>
      )
    case 'failed':
      return (
        <>
          <StatusBanner
            variant='error'
            primary='ACHIEVEMENT SYNC FAILED'
            secondary='Retrying on the next 6-hour cycle.'
          />
          {achievements.length > 0 ? (
            <AchievementList achievements={achievements} gameId={gameId} />
          ) : (
            <p className='achievement-list-empty'>
              &gt; COULD NOT LOAD ACHIEVEMENTS
            </p>
          )}
        </>
      )
    default:
      return <AchievementList achievements={achievements} gameId={gameId} />
  }
}

export default async function GameDetailPage({
  params,
}: {
  params: PageParams
}) {
  const { id } = await params
  if (!id) notFound()

  const entry = await findUserEntryByMediaItemId(id)
  if (!entry || entry.media_item.type !== MediaType.GAME) notFound()
  if (entry.media_item.igdb_id === null) {
    logger.warn(
      { event: 'game_detail.missing_igdb_id', mediaItemId: id },
      'GAME row has no igdb_id; rendering 404',
    )
    notFound()
  }

  const igdbId = entry.media_item.igdb_id

  // IGDB is fetched in parallel as a best-effort warm read so the page degrades
  // gracefully when IGDB is unavailable. The result is not consumed today:
  // upstream `status` is not part of IgdbGameSchema and screenshots render from
  // the persisted DB row, which is the source of truth for every shown field.
  const [, achievementRows] = await Promise.all([
    resolveIgdbGame(igdbId),
    db.achievement.findMany({
      where: { game_id: id },
      orderBy: [
        { unlocked: 'desc' },
        { unlocked_at: 'desc' },
        { steam_api_name: 'asc' },
      ],
    }),
  ])

  const achievements: AchievementListItem[] = achievementRows.map((a) => ({
    id: a.id,
    steam_api_name: a.steam_api_name,
    display_name: a.display_name,
    description: a.description,
    icon_url: a.icon_url,
    unlocked: a.unlocked,
    unlocked_at: a.unlocked_at,
    percent_global: a.percent_global,
  }))

  const year = deriveDisplayYear(entry.media_item.release_date)
  const platforms = entry.media_item.platforms
  const genres = entry.media_item.genres
  const screenshots = entry.media_item.screenshots.filter(
    (imageId) => imageId.trim().length > 0,
  )

  const metadata: MetadataItem[] = []
  if (platforms.length > 0) {
    metadata.push({ value: platforms.slice(0, 3).join(' · ').toUpperCase() })
  }
  if (
    entry.media_item.playtime_minutes !== null &&
    entry.media_item.playtime_minutes > 0
  ) {
    metadata.push({
      value: `${Math.max(1, Math.round(entry.media_item.playtime_minutes / 60))} HRS`,
    })
  }
  if (entry.media_item.developer_name) {
    metadata.push({ value: entry.media_item.developer_name.toUpperCase() })
  }
  if (year !== null) metadata.push({ value: String(year) })
  if (genres.length > 0) {
    metadata.push({
      value: genres.map((g) => g.toUpperCase()).join(' · '),
      dim: true,
    })
  }

  const synopsisParagraphs = (entry.media_item.overview ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const posterUrl = entry.media_item.poster_path
    ? getGameImageUrl(entry.media_item.poster_path, 't_cover_big')
    : null

  const mediumLabel = `GAME${year !== null ? ` · ${year}` : ''}`

  return (
    <main className='game-detail-page'>
      <BackToLibraryLink medium='games' />
      <DetailHero
        mediaItemId={entry.media_item_id}
        medium='games'
        mediumLabel={mediumLabel}
        title={entry.media_item.title}
        originalTitle={entry.media_item.original_title}
        posterUrl={posterUrl}
        metadata={metadata}
        currentStatus={entry.status}
        imdbId={null}
        showQbtButton={true}
      />
      <div className='anime-detail-rule' aria-hidden='true' />
      {synopsisParagraphs.length > 0 ? (
        <article className='anime-detail-synopsis'>
          {synopsisParagraphs.map((para, idx) => (
            <p key={idx}>{para}</p>
          ))}
        </article>
      ) : null}
      <div
        className='anime-detail-rule anime-detail-rule-thick'
        aria-hidden='true'
      />
      {screenshots.length > 0 ? (
        <SectionBand title='Screenshots' count={screenshots.length}>
          <ul className='game-detail-screenshots'>
            {screenshots.map((imageId, idx) => (
              <li key={imageId}>
                <a
                  href={getGameImageUrl(imageId, 't_1080p')}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  <Image
                    src={getGameImageUrl(imageId, 't_screenshot_med')}
                    alt={`${entry.media_item.title} screenshot ${idx + 1}`}
                    width={569}
                    height={320}
                  />
                </a>
              </li>
            ))}
          </ul>
        </SectionBand>
      ) : null}
      <SectionBand title='Achievements'>
        {renderAchievementSection(
          entry.media_item.achievement_sync_status,
          achievements,
          entry.media_item_id,
        )}
      </SectionBand>
      {platforms.length > 0 ? (
        <SectionBand title='Platforms'>
          <ul className='game-detail-platform-list'>
            {platforms.map((p) => (
              <li key={p} className='anime-detail-studio-chip'>
                {p}
              </li>
            ))}
          </ul>
        </SectionBand>
      ) : null}
      {genres.length > 0 ? (
        <SectionBand title='Genres'>
          <ul className='game-detail-genre-list'>
            {genres.map((g) => (
              <li key={g} className='anime-detail-studio-chip'>
                {g}
              </li>
            ))}
          </ul>
        </SectionBand>
      ) : null}
      <SectionBand title='Related'>
        <p className='game-detail-placeholder'>
          Franchise relations ship in Phase 10.
        </p>
      </SectionBand>
    </main>
  )
}
