'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { WatchStatus } from '@prisma/client'
import { EpisodeWatchToggle } from '@/components/molecules/EpisodeWatchToggle'

export type EpisodeDetailToggleProps = {
  mediaItemId: string
  showId: string
  initialStatus: WatchStatus | null
  unaired: boolean
  label: string
}

async function putEpisodeStatus(body: {
  mediaItemId: string
  status: WatchStatus
}): Promise<void> {
  const res = await fetch('/api/progress', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`episode_status_failed:${res.status}`)
  }
}

export function EpisodeDetailToggle({
  mediaItemId,
  showId,
  initialStatus,
  unaired,
  label,
}: EpisodeDetailToggleProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  // Optimistic state so the checkbox flips immediately, then either confirms
  // (onSuccess) or rolls back (onError).
  const [status, setStatus] = useState<WatchStatus | null>(initialStatus)

  const mutation = useMutation<
    void,
    Error,
    { mediaItemId: string; status: WatchStatus }
  >({
    mutationFn: putEpisodeStatus,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['library', 'tv'] })
      void queryClient.invalidateQueries({ queryKey: ['tvDetail', showId] })
      router.refresh()
    },
    onError: () => {
      setStatus(initialStatus)
      toast.error('COULD NOT UPDATE EPISODE')
    },
  })

  const checked = status === WatchStatus.COMPLETED

  function handleToggle() {
    const next = checked
      ? WatchStatus.PLAN_TO_WATCH
      : WatchStatus.COMPLETED
    setStatus(next)
    mutation.mutate({ mediaItemId, status: next })
  }

  return (
    <EpisodeWatchToggle
      checked={checked}
      disabled={unaired}
      label={label}
      onToggle={handleToggle}
    />
  )
}
