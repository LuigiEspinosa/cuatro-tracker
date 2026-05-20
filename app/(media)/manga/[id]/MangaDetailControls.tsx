'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChapterVolumeTracker } from '@/components/molecules/ChapterVolumeTracker'

export type MangaDetailControlsProps = {
  mediaItemId: string
  chapterCount: number | null
  volumeCount: number | null
  progress: number
  volumeProgress: number
  lifecycleStatus: string | null
}

type ProgressBody = {
  mediaItemId: string
  progress: number
  volumeProgress: number
}

async function putProgress(body: ProgressBody): Promise<void> {
  const res = await fetch('/api/progress', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`manga_progress_failed:${res.status}`)
  }
}

export function MangaDetailControls({
  mediaItemId,
  chapterCount,
  volumeCount,
  progress,
  volumeProgress,
  lifecycleStatus,
}: MangaDetailControlsProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const mutation = useMutation<void, Error, ProgressBody>({
    mutationFn: putProgress,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['library', 'manga'] })
      void queryClient.invalidateQueries({
        queryKey: ['mangaDetail', mediaItemId],
      })
      router.refresh()
    },
    onError: () => {
      toast.error('COULD NOT UPDATE PROGRESS')
    },
  })

  function handleUpdate(next: { progress: number; volumeProgress: number }) {
    // Molecule owns the intent translation; island is a thin transport.
    mutation.mutate({ mediaItemId, ...next })
  }

  return (
    <ChapterVolumeTracker
      chapterCount={chapterCount}
      volumeCount={volumeCount}
      progress={progress}
      volumeProgress={volumeProgress}
      lifecycleStatus={lifecycleStatus}
      onUpdate={handleUpdate}
      disabled={mutation.isPending}
    />
  )
}
