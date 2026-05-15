'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { ProgressResponse } from '@/lib/types/progress'

export type UserRatingProps = {
  mediaItemId: string
  initialValue: number | null
}

type MutationBody = { mediaItemId: string; user_rating: number | null }

async function putRating(body: MutationBody): Promise<ProgressResponse> {
  const res = await fetch('/api/progress', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`rating_update_failed:${res.status}`)
  }
  return res.json() as Promise<ProgressResponse>
}

export function UserRating({ mediaItemId, initialValue }: UserRatingProps) {
  const [value, setValue] = useState<number | null>(initialValue)
  const [preview, setPreview] = useState<number | null>(null)
  const router = useRouter()
  const queryClient = useQueryClient()

  const mutation = useMutation<ProgressResponse, Error, MutationBody>({
    mutationFn: putRating,
    onSuccess: (data) => {
      setValue(data.userRating)
      void queryClient.invalidateQueries({
        queryKey: ['detail', 'movies', mediaItemId],
      })
      router.refresh()
    },
    onError: () => {
      // Per-call onError in `commit()` handles the rollback to the previous
      // persisted value; an extra rollback here would clobber it on
      // back-to-back successful-then-failed mutations.
      toast.error('COULD NOT SAVE RATING')
    },
  })

  function commit(next: number | null) {
    const prev = value
    setValue(next) // optimistic
    setPreview(null)
    mutation.mutate(
      { mediaItemId, user_rating: next },
      {
        onError: () => {
          setValue(prev) // rollback if previous wasn't already the value
        },
      },
    )
  }

  function handleStarClick(idx: number) {
    // Click the currently-filled star at same index → clear
    if (value === idx) {
      commit(null)
      return
    }
    commit(idx)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      const next = Math.min(10, (preview ?? value ?? 0) + 1)
      setPreview(next)
      return
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      const next = Math.max(0, (preview ?? value ?? 0) - 1)
      setPreview(next === 0 ? null : next)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (preview !== null) commit(preview)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setPreview(null)
    }
  }

  const displayValue = preview ?? value
  const filledThrough = displayValue ?? 0

  return (
    <div className='user-rating' onKeyDown={handleKeyDown}>
      <span className='user-rating-label'>YOUR RATING:</span>
      <div
        className='user-rating-stars'
        role='radiogroup'
        aria-label='Rate from 1 to 10'
        tabIndex={0}
        onMouseLeave={() => setPreview(null)}
      >
        {Array.from({ length: 10 }).map((_, i) => {
          const idx = i + 1
          const filled = idx <= filledThrough
          return (
            <button
              key={idx}
              type='button'
              className='user-rating-star'
              data-filled={filled ? 'true' : 'false'}
              role='radio'
              aria-checked={value === idx}
              aria-label={`${idx} of 10`}
              onMouseEnter={() => setPreview(idx)}
              onFocus={() => setPreview(idx)}
              onClick={() => handleStarClick(idx)}
            >
              {filled ? '★' : '☆'}
            </button>
          )
        })}
      </div>
      <span className='user-rating-value'>
        {value === null ? '—/10' : `${value}/10`}
      </span>
      {value !== null ? (
        <button
          type='button'
          className='user-rating-clear'
          onClick={() => commit(null)}
        >
          (clear)
        </button>
      ) : null}
    </div>
  )
}
