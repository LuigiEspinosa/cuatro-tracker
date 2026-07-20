'use client'

// Client island: opens an EventSource to the SSE events route, tracks live
// progress, and swaps to the summary or warning banner on the terminal frame.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PhosphorBar } from '@/components/atoms/PhosphorBar'
import { BitmapText } from '@/components/atoms/BitmapText'

type Phase = 'running' | 'complete' | 'error'

type Summary = {
  imported: number
  duplicates: number
  failed: number
  total: number
}

export function ImportStatusClient({ jobId }: { jobId: string }) {
  const [processed, setProcessed] = useState(0)
  const [total, setTotal] = useState(0)
  const [currentTitle, setCurrentTitle] = useState('')
  const [phase, setPhase] = useState<Phase>('running')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [errorReason, setErrorReason] = useState<string | null>(null)

  useEffect(() => {
    const source = new EventSource(`/api/admin/import/${jobId}/events`)

    const onProgress = (e: Event) => {
      const data = (e as MessageEvent).data
      if (typeof data !== 'string') return
      try {
        const frame = JSON.parse(data) as {
          processed: number
          total: number
          current_title: string
        }
        setProcessed(frame.processed)
        setTotal(frame.total)
        setCurrentTitle(frame.current_title)
      } catch {
        // Ignore a malformed frame; the next one supersedes it.
      }
    }

    const onComplete = (e: Event) => {
      const data = (e as MessageEvent).data
      if (typeof data === 'string') {
        try {
          const frame = JSON.parse(data) as Summary
          setSummary({
            imported: frame.imported,
            duplicates: frame.duplicates,
            failed: frame.failed,
            total: frame.total,
          })
        } catch {
          // Fall through to the summary view without counts.
        }
      }
      setPhase('complete')
      source.close()
    }

    const onFail = (e: Event) => {
      // EventSource fires a built-in 'error' event (no data) on a connection
      // blip; our server 'error' frame carries a JSON reason. Only the
      // data-bearing one is a real job failure.
      const data = (e as MessageEvent).data
      if (typeof data !== 'string') return
      try {
        const frame = JSON.parse(data) as { reason?: string }
        setErrorReason(frame.reason ?? 'Import failed.')
      } catch {
        setErrorReason('Import failed.')
      }
      setPhase('error')
      source.close()
    }

    source.addEventListener('message', onProgress)
    source.addEventListener('complete', onComplete)
    source.addEventListener('error', onFail)

    return () => source.close()
  }, [jobId])

  if (phase === 'error') {
    return (
      <div className='imp-status-error' role='alert'>
        <p className='imp-error-title'>IMPORT FAILED</p>
        <p className='imp-error-reason'>{errorReason}</p>
        <Link href='/admin/import' className='imp-retry'>
          RETURN TO WIZARD
        </Link>
      </div>
    )
  }

  if (phase === 'complete') {
    // Render the summary on completion even if the counts frame did not parse,
    // so a malformed terminal frame never strands the page on the progress bar.
    return (
      <div className='imp-summary'>
        <p className='imp-summary-line'>
          {summary
            ? `${summary.imported} ITEMS IMPORTED · ${summary.duplicates} DUPLICATES DETECTED · SCAN QUEUED FOR REVIEW`
            : 'IMPORT COMPLETE · SCAN QUEUED FOR REVIEW'}
        </p>
        {summary && summary.failed > 0 && (
          <p className='imp-summary-note'>{summary.failed} ROWS FAILED</p>
        )}
        <Link href='/admin/merge' className='imp-cta'>
          REVIEW MERGES
        </Link>
      </div>
    )
  }

  return (
    <div className='imp-progress'>
      <PhosphorBar value={processed} max={total} label='IMPORT PROGRESS' />
      <p className='imp-progress-count'>
        {processed} / {total || '?'}
      </p>
      <p className='imp-streaming'>
        <BitmapText size={13} tone='cream-dim'>
          IMPORTING: {currentTitle || '...'}
        </BitmapText>
      </p>
    </div>
  )
}
