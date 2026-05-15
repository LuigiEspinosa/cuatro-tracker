import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { MediaType, WatchStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { getTvEpisode, getImageUrl } from '@/lib/api/tmdb'
import { logger } from '@/lib/logger'
import { EpisodeDetailToggle } from './EpisodeDetailToggle'

export const dynamic = 'force-dynamic'

type PageParams = Promise<{ id: string; n: string; e: string }>

function parseSeasonOrEpisodeInt(raw: string): number | null {
  // Strict integer match — rejects '1.5', '3xss', '01' (canonicalisation) so
  // multiple URL spellings can't render the same content. Season 0 is valid
  // (Specials); negatives rejected.
  if (!/^(0|[1-9]\d*)$/.test(raw)) return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function formatAirDate(d: Date | null, unaired: boolean): {
  label: string
  prefix: string | null
} {
  if (!d || d.getUTCFullYear() === 1970) {
    return { label: 'TBA', prefix: unaired ? 'AIRS' : null }
  }
  return {
    label: d.toISOString().slice(0, 10),
    // Aired episodes show the date alone (no verb prefix) per Story 7.6 AC-3;
    // only the future-tense `AIRS {date}` carries a prefix.
    prefix: unaired ? 'AIRS' : null,
  }
}

export async function generateMetadata({
  params,
}: {
  params: PageParams
}): Promise<{ title: string }> {
  const { id, n, e } = await params
  const seasonN = parseSeasonOrEpisodeInt(n)
  const episodeE = parseSeasonOrEpisodeInt(e)
  if (seasonN === null || episodeE === null) {
    return { title: 'EPISODE NOT FOUND · Cuatro Tracker' }
  }
  const episode = await db.mediaItem.findFirst({
    where: {
      parent_id: id,
      season_number: seasonN,
      episode_number: episodeE,
      type: MediaType.TV_EPISODE,
    },
    select: {
      title: true,
      parent: { select: { title: true } },
    },
  })
  if (!episode) return { title: 'EPISODE NOT FOUND · Cuatro Tracker' }
  return {
    title: `S${seasonN}E${episodeE} · ${episode.parent?.title ?? 'TV'} · Cuatro Tracker`,
  }
}

export default async function EpisodeDetailPage({
  params,
}: {
  params: PageParams
}) {
  const { id, n, e } = await params
  const seasonN = parseSeasonOrEpisodeInt(n)
  const episodeE = parseSeasonOrEpisodeInt(e)
  if (seasonN === null || episodeE === null) notFound()

  const episode = await db.mediaItem.findFirst({
    where: {
      parent_id: id,
      season_number: seasonN,
      episode_number: episodeE,
      type: MediaType.TV_EPISODE,
    },
    include: {
      user_entry: true,
      parent: {
        include: { user_entry: true },
      },
    },
  })
  // Episode missing OR the parent show is not in the user's library OR the
  // parent row is not actually a TV_SHOW (corrupted-data defence per F2).
  if (
    !episode ||
    !episode.parent ||
    !episode.parent.user_entry ||
    episode.parent.type !== MediaType.TV_SHOW
  ) {
    notFound()
  }

  // Aired-episode count for the "EP / TOTAL" header.
  const totalAired = await db.mediaItem.count({
    where: {
      parent_id: id,
      type: MediaType.TV_EPISODE,
      unaired: false,
    },
  })

  // TMDB episode payload (guest cast, fuller overview, optional still
  // backfill). Best-effort: a fetch failure shouldn't 500 the page since the
  // local episode data is enough to render the core surface.
  let tmdbEpisode: Awaited<ReturnType<typeof getTvEpisode>> | null = null
  if (episode.parent.tmdb_id != null) {
    try {
      tmdbEpisode = await getTvEpisode(
        episode.parent.tmdb_id,
        seasonN,
        episodeE,
      )
    } catch (err) {
      // Best-effort: an upstream failure shouldn't 500 the page (the local
      // episode data is enough). Surface the failure to the operator so the
      // missing guest cast isn't silent (F4).
      logger.warn(
        {
          event: 'episode_detail.tmdb_fetch_failed',
          showId: id,
          seasonN,
          episodeE,
          err,
        },
        'getTvEpisode rejected; rendering without TMDB guest cast',
      )
      tmdbEpisode = null
    }
  }

  const stillPath = episode.still_path ?? tmdbEpisode?.still_path ?? null
  const stillUrl = getImageUrl(stillPath, 'w780')

  const airDate = formatAirDate(episode.release_date, episode.unaired)

  const guestStars = (tmdbEpisode?.guest_stars ?? []).slice(0, 8)

  const overviewParagraphs = (episode.overview ?? '')
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const status: WatchStatus | null = episode.user_entry?.status ?? null

  return (
    <main className='episode-detail-page'>
      <Link
        href={`/tv/${id}#season-${seasonN}`}
        className='episode-detail-back'
      >
        &lt; S{seasonN} OF {episode.parent.title.toUpperCase()}
      </Link>

      <header className='episode-detail-header'>
        <p className='episode-detail-code'>
          S{seasonN} EP{episodeE} / {totalAired}
        </p>
        <h1 className='episode-detail-title'>{episode.title}</h1>
      </header>

      {stillUrl ? (
        <div className='episode-detail-still'>
          <Image
            src={stillUrl}
            alt={episode.title}
            width={780}
            height={439}
            unoptimized
          />
        </div>
      ) : null}

      {overviewParagraphs.length > 0 ? (
        <article className='episode-detail-overview'>
          {overviewParagraphs.map((para, idx) => (
            <p key={idx}>{para}</p>
          ))}
        </article>
      ) : null}

      <section className='episode-detail-meta' aria-label='Episode metadata'>
        <p className='episode-detail-air-date'>
          {airDate.prefix !== null ? (
            <>
              <span className='episode-detail-air-date-prefix'>
                {airDate.prefix}
              </span>{' '}
            </>
          ) : null}
          <span className='episode-detail-air-date-value'>{airDate.label}</span>
        </p>
        {episode.runtime ? (
          <p className='episode-detail-runtime'>{episode.runtime} MIN</p>
        ) : null}
        <EpisodeDetailToggle
          mediaItemId={episode.id}
          showId={id}
          initialStatus={status}
          unaired={episode.unaired}
          label={`Mark ${episode.title} watched`}
        />
      </section>

      {guestStars.length > 0 ? (
        <section className='episode-detail-guests' aria-label='Guest cast'>
          <h2 className='episode-detail-guests-title'>GUEST CAST</h2>
          <ul className='episode-detail-guests-list'>
            {guestStars.map((guest) => (
              <li key={`${guest.id}-${guest.name}`}>
                <span className='episode-detail-guest-name'>{guest.name}</span>
                {guest.character ? (
                  <span className='episode-detail-guest-role'>
                    {guest.character}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
