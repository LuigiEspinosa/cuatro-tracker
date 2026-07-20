'use client'

// Client island: the wizard owns local step / format / file state, parses a
// lightweight in-browser preview for the REVIEW step (the authoritative parse +
// validation is server-side in the bulkImport job), and POSTs the multipart
// upload before navigating to the SSE status page.

import { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BitmapText } from '@/components/atoms/BitmapText'
import { CRTPixelButton } from '@/components/atoms/CRTPixelButton'
import type { ImportFormat } from '@/lib/import/formats'
import { MAX_IMPORT_BYTES } from '@/lib/import/constants'

type FormatMeta = {
  value: ImportFormat
  label: string
  hint: string
  accept: string
  ext: string[]
}

const FORMATS: FormatMeta[] = [
  {
    value: 'TRAKT_JSON',
    label: 'TRAKT JSON',
    hint: 'Movies and shows: watched history or watchlist export',
    accept: '.json,application/json',
    ext: ['.json'],
  },
  {
    value: 'MAL_XML',
    label: 'MYANIMELIST XML',
    hint: 'Anime and manga list export',
    accept: '.xml,text/xml,application/xml',
    ext: ['.xml'],
  },
  {
    value: 'STEAM_EXPORT',
    label: 'STEAM LIBRARY',
    hint: 'Owned games (GetOwnedGames JSON)',
    accept: '.json,application/json',
    ext: ['.json'],
  },
]

// Rough per-row cost for the REVIEW estimate. MAL rows carry the 700ms AniList
// throttle; Trakt hits TMDB; Steam upserts directly with no network.
const PER_ROW_SECONDS: Record<ImportFormat, number> = {
  TRAKT_JSON: 0.3,
  MAL_XML: 0.75,
  STEAM_EXPORT: 0.05,
}

type Preview = { count: number; samples: string[] }

type TraktEntry = {
  movie?: { title?: string; ids?: { tmdb?: number | null } }
  show?: { title?: string; ids?: { tmdb?: number | null } }
}

function traktEntries(parsed: unknown): TraktEntry[] {
  if (Array.isArray(parsed)) return parsed as TraktEntry[]
  if (parsed && typeof parsed === 'object') {
    const arrays = Object.values(parsed as Record<string, unknown>).filter(
      Array.isArray,
    ) as unknown[][]
    return arrays.flat() as TraktEntry[]
  }
  return []
}

function previewTrakt(text: string): Preview {
  const entries = traktEntries(JSON.parse(text))
  const samples: string[] = []
  let count = 0
  for (const entry of entries) {
    const media = entry.movie ?? entry.show
    const tmdb = media?.ids?.tmdb
    if (!media || tmdb === null || tmdb === undefined) continue
    count += 1
    if (samples.length < 5) samples.push(media.title ?? '(untitled)')
  }
  return { count, samples }
}

function previewMal(text: string): Preview {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('invalid XML')
  const nodes = Array.from(doc.querySelectorAll('anime, manga'))
  const samples = nodes
    .slice(0, 5)
    .map(
      (n) =>
        n.querySelector('series_title, manga_title')?.textContent?.trim() ??
        '(untitled)',
    )
  return { count: nodes.length, samples }
}

function previewSteam(text: string): Preview {
  const parsed = JSON.parse(text) as {
    response?: { games?: Array<{ name?: string }> }
  }
  const games = parsed.response?.games ?? []
  return {
    count: games.length,
    samples: games.slice(0, 5).map((g) => g.name ?? '(unnamed)'),
  }
}

function buildPreview(format: ImportFormat, text: string): Preview {
  switch (format) {
    case 'TRAKT_JSON':
      return previewTrakt(text)
    case 'MAL_XML':
      return previewMal(text)
    case 'STEAM_EXPORT':
      return previewSteam(text)
  }
}

function estimateDuration(format: ImportFormat, count: number): string {
  const secs = Math.ceil(count * PER_ROW_SECONDS[format])
  if (secs < 60) return `~${secs}s`
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return s === 0 ? `~${m}m` : `~${m}m ${s}s`
}

const STEP_LABELS = ['SELECT FORMAT', 'UPLOAD FILE', 'REVIEW & CONFIRM']

export function ImportWizardClient() {
  const router = useRouter()
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [format, setFormat] = useState<ImportFormat | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [advisory, setAdvisory] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const meta = format ? FORMATS.find((f) => f.value === format) ?? null : null

  const acceptFile = useCallback(
    async (chosen: File) => {
      setFile(chosen)
      setPreview(null)
      setSubmitError(null)
      if (!format || !meta) return
      if (chosen.size > MAX_IMPORT_BYTES) {
        // Reject before reading the whole file into memory: a huge file would
        // otherwise freeze the tab on chosen.text() + parse. The server also
        // enforces this cap (413). preview stays null so START stays disabled.
        setAdvisory('File is too large (10 MB max). Choose a smaller export.')
        return
      }
      const extOk = meta.ext.some((e) =>
        chosen.name.toLowerCase().endsWith(e),
      )
      setAdvisory(
        extOk
          ? null
          : `Expected a ${meta.ext.join(' / ')} file. Continuing anyway; the server validates on import.`,
      )
      try {
        const text = await chosen.text()
        setPreview(buildPreview(format, text))
      } catch {
        setPreview({ count: 0, samples: [] })
        setAdvisory('Could not read this file as the selected format.')
      }
    },
    [format, meta],
  )

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const dropped = e.dataTransfer.files?.[0]
      if (dropped) void acceptFile(dropped)
    },
    [acceptFile],
  )

  const canReview = Boolean(file && preview && preview.count >= 1)

  const startImport = useCallback(async () => {
    if (!format || !file) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const body = new FormData()
      body.set('format', format)
      body.set('file', file)
      const res = await fetch('/api/admin/import', { method: 'POST', body })
      if (!res.ok) {
        setSubmitting(false)
        setSubmitError(
          res.status === 413
            ? 'File is too large (10 MB max).'
            : 'Upload failed. Check the file and try again.',
        )
        return
      }
      const data = (await res.json()) as { jobId: string }
      router.push(`/admin/import/${data.jobId}/status`)
    } catch {
      setSubmitting(false)
      setSubmitError('Network error. Try again.')
    }
  }, [format, file, router])

  return (
    <div className='imp-wizard'>
      <ol className='imp-steps' aria-label='Import steps'>
        {STEP_LABELS.map((label, i) => (
          <li
            key={label}
            className='imp-step-chip'
            data-active={i === step ? 'true' : undefined}
            data-done={i < step ? 'true' : undefined}
          >
            <span className='imp-step-num'>{i + 1}</span>
            <span className='imp-step-label'>{label}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className='imp-panel' aria-label='Select format'>
          <fieldset className='imp-formats'>
            <legend className='imp-legend'>SELECT FORMAT</legend>
            {FORMATS.map((f) => (
              <label key={f.value} className='imp-format-opt'>
                <input
                  type='radio'
                  name='import-format'
                  value={f.value}
                  checked={format === f.value}
                  onChange={() => {
                    setFormat(f.value)
                    setFile(null)
                    setPreview(null)
                    setAdvisory(null)
                  }}
                  className='imp-radio'
                />
                <span className='imp-format-text'>
                  <span className='imp-format-label'>{f.label}</span>
                  <span className='imp-format-hint'>{f.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </section>
      )}

      {step === 1 && (
        <section className='imp-panel' aria-label='Upload file'>
          <div
            className='imp-drop'
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <BitmapText size={14} tone='cream-dim'>
              {file ? file.name : 'DROP FILE HERE OR CLICK TO BROWSE'}
            </BitmapText>
            <input
              ref={inputRef}
              type='file'
              accept={meta?.accept}
              className='imp-file-input'
              onChange={(e) => {
                const chosen = e.target.files?.[0]
                if (chosen) void acceptFile(chosen)
              }}
            />
          </div>
          {advisory && <p className='imp-advisory'>{advisory}</p>}
          {file && preview && (
            <p className='imp-preview-line'>
              {preview.count} {preview.count === 1 ? 'ROW' : 'ROWS'} DETECTED
            </p>
          )}
        </section>
      )}

      {step === 2 && meta && preview && (
        <section className='imp-panel' aria-label='Review and confirm'>
          <dl className='imp-review'>
            <div className='imp-review-row'>
              <dt>FORMAT</dt>
              <dd>{meta.label}</dd>
            </div>
            <div className='imp-review-row'>
              <dt>ROWS</dt>
              <dd>{preview.count}</dd>
            </div>
            <div className='imp-review-row'>
              <dt>EST. DURATION</dt>
              <dd>{estimateDuration(meta.value, preview.count)}</dd>
            </div>
          </dl>
          {preview.samples.length > 0 && (
            <ul className='imp-samples'>
              {preview.samples.map((s, i) => (
                <li key={`${s}-${i}`} className='imp-sample'>
                  {s}
                </li>
              ))}
            </ul>
          )}
          {submitError && (
            <p className='imp-advisory' role='alert'>
              {submitError}
            </p>
          )}
        </section>
      )}

      <div className='imp-nav'>
        <CRTPixelButton
          fullWidth={false}
          disabled={step === 0 || submitting}
          onClick={() => setStep((s) => (s > 0 ? ((s - 1) as 0 | 1 | 2) : s))}
        >
          BACK
        </CRTPixelButton>
        {step < 2 ? (
          <CRTPixelButton
            fullWidth={false}
            disabled={step === 0 ? !format : !canReview}
            onClick={() => setStep((s) => ((s + 1) as 0 | 1 | 2))}
          >
            NEXT
          </CRTPixelButton>
        ) : (
          <CRTPixelButton
            fullWidth={false}
            disabled={!canReview || submitting}
            onClick={() => void startImport()}
          >
            {submitting ? 'STARTING...' : 'START IMPORT'}
          </CRTPixelButton>
        )}
      </div>
    </div>
  )
}
