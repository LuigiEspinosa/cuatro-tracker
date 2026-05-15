'use client'

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { WatchStatus } from '@prisma/client'
import { PhosphorLED, type PhosphorLEDStatus } from '@/components/atoms/PhosphorLED'
import type { ProgressResponse } from '@/lib/types/progress'

export type WatchStatusControlProps = {
  mediaItemId: string
  currentStatus: WatchStatus
}

const STATUS_ORDER: WatchStatus[] = [
  WatchStatus.PLAN_TO_WATCH,
  WatchStatus.WATCHING,
  WatchStatus.COMPLETED,
  WatchStatus.ON_HOLD,
  WatchStatus.DROPPED,
]

const STATUS_TO_LED: Record<WatchStatus, PhosphorLEDStatus> = {
  PLAN_TO_WATCH: 'backlog',
  WATCHING: 'in-progress',
  COMPLETED: 'completed',
  ON_HOLD: 'on-hold',
  DROPPED: 'dropped',
}

function labelFor(status: WatchStatus): string {
  return status.replaceAll('_', ' ')
}

async function putStatus(body: {
  mediaItemId: string
  status: WatchStatus
  completed_at: string | null
}): Promise<ProgressResponse> {
  const res = await fetch('/api/progress', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`status_update_failed:${res.status}`)
  }
  return res.json() as Promise<ProgressResponse>
}

export function WatchStatusControl({
  mediaItemId,
  currentStatus,
}: WatchStatusControlProps) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<WatchStatus>(currentStatus)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()
  const queryClient = useQueryClient()

  useEffect(() => {
    setStatus(currentStatus)
  }, [currentStatus])

  useEffect(() => {
    if (!open) return
    function onDocumentClick(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocumentClick)
    return () => document.removeEventListener('mousedown', onDocumentClick)
  }, [open])

  const mutation = useMutation<
    ProgressResponse,
    Error,
    { mediaItemId: string; status: WatchStatus; completed_at: string | null }
  >({
    mutationFn: putStatus,
    onSuccess: (data) => {
      setStatus(data.status)
      void queryClient.invalidateQueries({ queryKey: ['library', 'movies'] })
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'recently-added'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['dashboard', 'up-next'],
      })
      void queryClient.invalidateQueries({
        queryKey: ['detail', 'movies', mediaItemId],
      })
      router.refresh()
      toast.success(`STATUS · ${labelFor(data.status)}`)
    },
    onError: () => {
      setStatus(currentStatus)
      toast.error('COULD NOT UPDATE STATUS')
    },
  })

  function selectStatus(next: WatchStatus) {
    setOpen(false)
    buttonRef.current?.focus()
    if (next === status) return
    setStatus(next) // optimistic
    mutation.mutate({
      mediaItemId,
      status: next,
      completed_at:
        next === WatchStatus.COMPLETED ? new Date().toISOString() : null,
    })
  }

  function handleButtonKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
    }
  }

  function handlePanelKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
      return
    }
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      ),
    )
    const activeIdx = items.findIndex((el) => el === document.activeElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = items[(activeIdx + 1) % items.length]
      next?.focus()
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next = items[(activeIdx - 1 + items.length) % items.length]
      next?.focus()
    }
  }

  return (
    <div className='watch-status-control' ref={containerRef}>
      <span className='watch-status-control-label'>STATUS:</span>
      <button
        ref={buttonRef}
        type='button'
        className='watch-status-control-button'
        aria-haspopup='listbox'
        aria-expanded={open}
        data-pulsing={mutation.isPending ? 'true' : 'false'}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleButtonKeyDown}
      >
        <PhosphorLED
          status={STATUS_TO_LED[status]}
          size={12}
          label={labelFor(status)}
        />
        <span className='watch-status-control-value'>{labelFor(status)}</span>
        <svg
          className='watch-status-control-chevron'
          viewBox='0 0 12 12'
          width={12}
          height={12}
          aria-hidden='true'
          focusable='false'
        >
          <path
            d='M3 4.5 L6 8 L9 4.5'
            stroke='currentColor'
            strokeWidth='1.5'
            fill='none'
            strokeLinecap='square'
            strokeLinejoin='miter'
          />
        </svg>
      </button>
      {open ? (
        <ul
          className='watch-status-control-panel'
          role='listbox'
          aria-label='Select watch status'
          onKeyDown={handlePanelKeyDown}
        >
          {STATUS_ORDER.map((option) => (
            <li key={option}>
              <button
                type='button'
                role='option'
                aria-selected={option === status}
                className='watch-status-control-option'
                data-active={option === status ? 'true' : 'false'}
                onClick={() => selectStatus(option)}
              >
                <PhosphorLED
                  status={STATUS_TO_LED[option]}
                  size={10}
                  label={labelFor(option)}
                />
                <span>{labelFor(option)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
