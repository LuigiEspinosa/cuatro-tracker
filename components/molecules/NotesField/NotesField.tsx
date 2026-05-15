'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { ProgressResponse } from '@/lib/types/progress'

export type NotesFieldProps = {
  mediaItemId: string
  initialNotes: string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

const DEBOUNCE_MS = 800

async function putNotes(body: {
  mediaItemId: string
  notes: string
}): Promise<ProgressResponse> {
  const res = await fetch('/api/progress', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`notes_update_failed:${res.status}`)
  }
  return res.json() as Promise<ProgressResponse>
}

export function NotesField({ mediaItemId, initialNotes }: NotesFieldProps) {
  const [expanded, setExpanded] = useState(initialNotes.length > 0)
  const [value, setValue] = useState(initialNotes)
  const [saveState, setSaveState] = useState<SaveState>(
    initialNotes.length > 0 ? 'saved' : 'idle',
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPersistedRef = useRef<string>(initialNotes)

  const mutation = useMutation<
    ProgressResponse,
    Error,
    { mediaItemId: string; notes: string }
  >({
    mutationFn: putNotes,
    onMutate: () => {
      setSaveState('saving')
    },
    onSuccess: (data) => {
      lastPersistedRef.current = data.notes ?? ''
      setSaveState('saved')
    },
    onError: () => {
      setSaveState('failed')
    },
  })

  function flush(next: string) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (next === lastPersistedRef.current) return
    mutation.mutate({ mediaItemId, notes: next })
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = event.target.value
    setValue(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      flush(next)
    }, DEBOUNCE_MS)
  }

  function handleBlur() {
    flush(value)
  }

  // Clean up any pending timer on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  if (!expanded) {
    return (
      <button
        type='button'
        className='notes-field-collapsed'
        onClick={() => setExpanded(true)}
      >
        &gt; NOTES ({value.length})
      </button>
    )
  }

  const saveIndicator = (() => {
    if (saveState === 'saving') return 'SAVING…'
    if (saveState === 'failed') return 'SAVE FAILED'
    return 'SAVED'
  })()

  return (
    <div className='notes-field'>
      <div className='notes-field-header'>
        <span className='notes-field-label'>NOTES</span>
        <button
          type='button'
          className='notes-field-collapse'
          onClick={() => setExpanded(false)}
        >
          (collapse)
        </button>
      </div>
      <textarea
        className='notes-field-textarea'
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        rows={5}
        maxLength={2000}
        placeholder='Type your notes…'
      />
      <div
        className='notes-field-indicator'
        data-state={saveState}
        aria-live='polite'
      >
        {saveIndicator}
      </div>
    </div>
  )
}
