'use client'
// Client component: it holds the current index and the pending list, fires the
// merge / dismiss POSTs, and advances the queue locally (OI #5) without a
// re-fetch. The RSC page hands it a fully display-ready, Prisma-free payload.

import { useCallback, useEffect, useState } from 'react'
import { FramedCover } from '@/components/molecules/FramedCover'
import { CRTPixelButton } from '@/components/atoms/CRTPixelButton'
import { MergeEmptyState } from './MergeEmptyState'
import type {
  MergeDiffRow,
  MergeRecordView,
  MergeSuggestionView,
} from './merge-view'

type MergeReviewClientProps = {
  suggestions: MergeSuggestionView[]
}

function MergePane({
  role,
  record,
}: {
  role: 'source' | 'target'
  record: MergeRecordView
}) {
  const isSource = role === 'source'
  return (
    <section className='merge-pane' aria-labelledby={`pane-${role}`}>
      <div className='merge-pane-head'>
        <span
          id={`pane-${role}`}
          className={`merge-pane-role ${isSource ? 'is-source' : 'is-target'}`}
        >
          {isSource ? 'SOURCE' : 'TARGET'}
        </span>
        <span className='merge-pane-note'>
          {isSource ? 'WILL BE DELETED' : 'WILL BE KEPT'}
        </span>
      </div>
      <div className='merge-pane-rule' aria-hidden='true' />
      <div className='merge-pane-body'>
        <div className='merge-cover' data-medium={record.medium}>
          {record.posterUrl ? (
            <FramedCover
              medium={record.medium}
              size='card'
              src={record.posterUrl}
              alt={record.title}
            />
          ) : (
            <div className='merge-cover-fallback' aria-hidden='true'>
              <span>?</span>
            </div>
          )}
        </div>
        <div className='merge-pane-text'>
          <h2 className='merge-pane-title'>{record.title}</h2>
          {record.originalTitle && record.originalTitle !== record.title && (
            <p className='merge-pane-original'>{record.originalTitle}</p>
          )}
          {record.sourceLabel && (
            <p className='merge-pane-source'>{record.sourceLabel}</p>
          )}
          {record.overview && (
            <p className='merge-pane-overview'>{record.overview}</p>
          )}
        </div>
      </div>
      <dl className='merge-meta'>
        <dt>Type</dt>
        <dd>{record.typeLabel}</dd>
        <dt>Release</dt>
        <dd>{record.releaseYear}</dd>
        {record.genres && (
          <>
            <dt>Genres</dt>
            <dd>{record.genres}</dd>
          </>
        )}
        {record.externalId && (
          <>
            <dt>Source ID</dt>
            <dd>{record.externalId}</dd>
          </>
        )}
      </dl>
    </section>
  )
}

function DiffRow({ row, index }: { row: MergeDiffRow; index: number }) {
  const tint = index % 2 === 0 ? 'row-even' : 'row-odd'
  return (
    <div className={`merge-diff-row ${tint}`}>
      <span className='merge-diff-label'>{row.label}</span>
      {row.match ? (
        <span className='merge-diff-val is-match merge-diff-span2'>
          <span className='merge-diff-tag'>MATCH</span>
          {row.target || '(none)'}
        </span>
      ) : (
        <>
          <span className='merge-diff-val is-removed'>
            <span className='merge-diff-tag'>SOURCE</span>
            {row.source || '(none)'}
          </span>
          <span className='merge-diff-val is-match'>
            <span className='merge-diff-tag'>TARGET</span>
            {row.target || '(none)'}
          </span>
        </>
      )}
    </div>
  )
}

function MergeSkeleton() {
  return (
    <div className='merge-skeleton' aria-hidden='true'>
      <div className='merge-compare'>
        <div className='merge-pane'>
          <span className='skel-box merge-skel-rule' />
          <div className='merge-pane-body'>
            <span className='skel-box merge-skel-cover' />
            <div className='merge-skel-lines'>
              <span className='skel-box merge-skel-line-lg' />
              <span className='skel-box merge-skel-line-sm' />
              <span className='skel-box merge-skel-line-md' />
            </div>
          </div>
        </div>
        <div className='merge-similarity'>
          <span className='skel-box merge-skel-num' />
        </div>
        <div className='merge-pane'>
          <span className='skel-box merge-skel-rule' />
          <div className='merge-pane-body'>
            <span className='skel-box merge-skel-cover' />
            <div className='merge-skel-lines'>
              <span className='skel-box merge-skel-line-lg' />
              <span className='skel-box merge-skel-line-sm' />
              <span className='skel-box merge-skel-line-md' />
            </div>
          </div>
        </div>
      </div>
      <div className='merge-diff-list'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`merge-diff-row ${i % 2 === 0 ? 'row-even' : 'row-odd'}`}>
            <span className='skel-box merge-skel-line-sm' />
            <span className='skel-box merge-skel-line-md' />
            <span className='skel-box merge-skel-line-md' />
          </div>
        ))}
      </div>
    </div>
  )
}

export function MergeReviewClient({ suggestions }: MergeReviewClientProps) {
  const [list, setList] = useState<MergeSuggestionView[]>(suggestions)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const total = list.length
  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const goNext = useCallback(
    () => setIndex((i) => Math.min(total - 1, i + 1)),
    [total],
  )

  // ArrowLeft / ArrowRight step through the queue (AC-8). Disabled mid-action so
  // an arrow press cannot race a merge in flight.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (busy) return
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, goPrev, goNext])

  const current = list[index]

  // Remove the resolved suggestion and keep the index on the item that shifts
  // into its place (clamped), so the view replaces in place without a scroll
  // jump (AC-8). The queue length before removal is `total`.
  const removeCurrent = useCallback(() => {
    setList((prev) => prev.filter((_, i) => i !== index))
    setIndex((i) => Math.min(i, Math.max(0, total - 2)))
  }, [index, total])

  async function post(url: string, body: unknown): Promise<boolean> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    // A 404 means the pair was already resolved elsewhere; drop it and advance
    // rather than stranding the admin on a dead suggestion.
    return res.ok || res.status === 404
  }

  async function handleMerge() {
    if (busy || !current) return
    setBusy(true)
    setActionError(null)
    try {
      const ok = await post('/api/admin/merge', {
        suggestionId: current.id,
        sourceId: current.source.id,
        targetId: current.target.id,
      })
      if (ok) removeCurrent()
      else setActionError('Merge failed. Try again.')
    } catch {
      setActionError('Merge failed. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDismiss() {
    if (busy || !current) return
    setBusy(true)
    setActionError(null)
    try {
      const ok = await post('/api/admin/merge/dismiss', {
        suggestionId: current.id,
      })
      if (ok) removeCurrent()
      else setActionError('Dismiss failed. Try again.')
    } catch {
      setActionError('Dismiss failed. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!current) {
    return <MergeEmptyState />
  }

  const pos = index + 1
  const diffCount = current.diff.filter((r) => !r.match).length

  return (
    <div className='merge-review'>
      <div className='merge-nav'>
        <span className='merge-nav-title'>Merge Queue</span>
        <button
          type='button'
          className='merge-nav-btn'
          onClick={goPrev}
          disabled={busy || index === 0}
        >
          {'< PREV'}
        </button>
        <button
          type='button'
          className='merge-nav-btn'
          onClick={goNext}
          disabled={busy || index === total - 1}
        >
          {'NEXT >'}
        </button>
        <span className='merge-nav-pos'>
          {pos} / {total} · CONFIDENCE
        </span>
      </div>

      {busy ? (
        <MergeSkeleton />
      ) : (
        <>
          <div className='merge-compare'>
            <MergePane role='source' record={current.source} />
            <div className='merge-similarity'>
              <span className='merge-similarity-label'>SIMILARITY</span>
              <span className='merge-similarity-num'>
                {current.confidence.toFixed(2)}
              </span>
              <span className='merge-similarity-sub'>
                {current.nearThreshold ? 'NEAR THRESHOLD' : 'HIGH MATCH'}
              </span>
            </div>
            <MergePane role='target' record={current.target} />
          </div>

          <section className='merge-diff' aria-labelledby='diff-title'>
            <div className='merge-diff-head'>
              <span id='diff-title' className='merge-diff-title'>
                Field Diff
              </span>
              <span className='merge-diff-count'>
                {diffCount} {diffCount === 1 ? 'DIFFERENCE' : 'DIFFERENCES'} ·{' '}
                {current.diff.length} FIELDS
              </span>
              <span className='merge-diff-rule' aria-hidden='true' />
            </div>
            <div className='merge-diff-list'>
              {current.diff.map((row, i) => (
                <DiffRow key={row.field} row={row} index={i} />
              ))}
            </div>
          </section>
        </>
      )}

      {actionError && (
        <p className='merge-action-error' role='alert'>
          {actionError}
        </p>
      )}

      <div className='merge-action-band'>
        <button
          type='button'
          className='merge-action-cancel'
          onClick={handleDismiss}
          disabled={busy}
        >
          {'CANCEL · DISMISS SUGGESTION'}
        </button>
        <div className='merge-action-merge'>
          <CRTPixelButton
            fullWidth={false}
            disabled={busy}
            onClick={handleMerge}
            className='merge-merge-btn'
          >
            {'> MERGE'}
          </CRTPixelButton>
          <span className='merge-underline' aria-hidden='true' />
        </div>
      </div>
    </div>
  )
}
