'use client'

import { useRouter } from 'next/navigation'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { WatchStatus } from '@prisma/client'
import { CRTPixelButton } from '@/components/atoms/CRTPixelButton'
import type { ProgressResponse } from '@/lib/types/progress'

export type MarkWatchedButtonProps = {
  mediaItemId: string
  currentStatus: WatchStatus
}

type MutationBody = {
  mediaItemId: string
  status: WatchStatus
  completed_at: string | null
}

function nextStatus(current: WatchStatus): WatchStatus | null {
  if (current === WatchStatus.PLAN_TO_WATCH) return WatchStatus.WATCHING
  if (current === WatchStatus.WATCHING) return WatchStatus.COMPLETED
  if (current === WatchStatus.ON_HOLD) return WatchStatus.WATCHING
  if (current === WatchStatus.DROPPED) return WatchStatus.WATCHING
  return null
}

async function putProgress(body: MutationBody): Promise<ProgressResponse> {
  const res = await fetch('/api/progress', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`progress_update_failed:${res.status}`)
  }
  return res.json() as Promise<ProgressResponse>
}

export function MarkWatchedButton({
  mediaItemId,
  currentStatus,
}: MarkWatchedButtonProps) {
  const next = nextStatus(currentStatus)
  const router = useRouter()
  const queryClient = useQueryClient()
  const mutation = useMutation<ProgressResponse, Error, MutationBody>({
    mutationFn: putProgress,
    onSuccess: (data) => {
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
      toast.success(`STATUS · ${data.status.replaceAll('_', ' ')}`)
    },
    onError: () => {
      toast.error('COULD NOT UPDATE STATUS')
    },
  })

  if (next === null) return null

  return (
    <CRTPixelButton
      fullWidth={false}
      disabled={mutation.isPending}
      onClick={() => {
        mutation.mutate({
          mediaItemId,
          status: next,
          completed_at:
            next === WatchStatus.COMPLETED ? new Date().toISOString() : null,
        })
      }}
    >
      &gt; MARK WATCHED
    </CRTPixelButton>
  )
}
