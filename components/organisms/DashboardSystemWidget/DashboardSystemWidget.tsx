import { PhosphorBar } from '@/components/atoms/PhosphorBar'

export type Torrent = {
  id: string
  name: string
  progress: number
}

export type DashboardSystemWidgetProps = {
  torrents?: Torrent[]
  throughput?: string | null
}

/* DashboardSystemWidget (organism, Story 5.4 OI #6).
 * Visual chrome only — Epic 12 (Story 12.3) wires the real qBittorrent client
 * subscription into the active-state prop shape. The widget renders:
 *  - Zero state: `> NO ACTIVE DOWNLOADS` label LEFT + `qBT · IDLE` meta RIGHT.
 *  - Active state: `> ACTIVE DOWNLOADS · <throughput>` (inline; no separate
 *    right-side meta) + one row per torrent (italic name + PhosphorBar +
 *    bitmap percentage). Per AC-2, the throughput lives in the inline label
 *    for active state — the right-side meta is reserved for the zero-state
 *    `qBT · IDLE` idle marker.
 */

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

export function DashboardSystemWidget({
  torrents,
  throughput = null,
}: DashboardSystemWidgetProps) {
  const isZero = torrents === undefined || torrents.length === 0
  const hasThroughput = throughput !== null && throughput.length > 0
  const headerLabel = isZero
    ? '> NO ACTIVE DOWNLOADS'
    : hasThroughput
      ? `> ACTIVE DOWNLOADS · ${throughput}`
      : '> ACTIVE DOWNLOADS'

  return (
    <div
      className={`dsw${isZero ? ' dsw-zero' : ''}`}
      role='region'
      aria-label='Now downloading'
    >
      <div className='dsw-head'>
        <span className='dsw-label'>{headerLabel}</span>
        {isZero ? <span className='dsw-meta'>qBT · IDLE</span> : null}
      </div>

      {!isZero ? (
        <div className='dsw-rows'>
          {torrents!.map((t) => {
            const safe = clampProgress(t.progress)
            return (
              <div key={t.id} className='dsw-row'>
                <span className='dsw-row-name'>{t.name}</span>
                <PhosphorBar
                  value={safe}
                  max={100}
                  label={`${t.name} download progress`}
                />
                <span className='dsw-row-pct'>{Math.round(safe)}%</span>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
