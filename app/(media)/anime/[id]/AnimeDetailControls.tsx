'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { EpisodeChecklist } from '@/components/molecules/EpisodeChecklist'

export type AnimeDetailControlsProps = {
  mediaItemId: string
  episodeCount: number
  progress: number
}

async function putProgress(body: {
  mediaItemId: string
  progress: number
}): Promise<void> {
  const res = await fetch('/api/progress', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`anime_progress_failed:${res.status}`)
  }
}

export function AnimeDetailControls({
  mediaItemId,
  episodeCount,
  progress,
}: AnimeDetailControlsProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const mutation = useMutation<
    void,
    Error,
    { mediaItemId: string; progress: number }
  >({
    mutationFn: putProgress,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['library', 'anime'] })
      void queryClient.invalidateQueries({
        queryKey: ['animeDetail', mediaItemId],
      })
      router.refresh()
    },
    onError: () => {
      toast.error('COULD NOT UPDATE EPISODE')
    },
  })

  function handleToggle(n: number, nextChecked: boolean) {
    // AC-4: check from below advances to n; uncheck from at-or-above retreats
    // to n - 1. The server's auto-advance branch then computes max() / status
    // transitions per AC-5.
    const nextProgress = nextChecked ? n : n - 1
    mutation.mutate({ mediaItemId, progress: nextProgress })
  }

  return (
    <EpisodeChecklist
      mediaItemId={mediaItemId}
      episodeCount={episodeCount}
      progress={progress}
      onToggleEpisode={handleToggle}
    />
  )
}
