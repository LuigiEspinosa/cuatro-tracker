'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { WatchStatus } from '@prisma/client'
import {
  SeasonAccordion,
  type SeasonGroup,
} from '@/components/molecules/SeasonAccordion'

export type TvDetailControlsProps = {
  showId: string
  seasons: SeasonGroup[]
  defaultExpandedSeason: number | null
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

async function postBulkSeason(body: {
  parentId: string
  scope: 'season'
  seasonNumber: number
  status: WatchStatus
}): Promise<{ updated: number }> {
  const res = await fetch('/api/progress/bulk', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`bulk_progress_failed:${res.status}`)
  }
  return res.json() as Promise<{ updated: number }>
}

export function TvDetailControls({
  showId,
  seasons,
  defaultExpandedSeason,
}: TvDetailControlsProps) {
  const router = useRouter()
  const queryClient = useQueryClient()

  function invalidateAndRefresh() {
    void queryClient.invalidateQueries({ queryKey: ['library', 'tv'] })
    void queryClient.invalidateQueries({ queryKey: ['tvDetail', showId] })
    router.refresh()
  }

  const episodeMutation = useMutation<
    void,
    Error,
    { mediaItemId: string; status: WatchStatus }
  >({
    mutationFn: putEpisodeStatus,
    onSuccess: () => {
      invalidateAndRefresh()
    },
    onError: () => {
      toast.error('COULD NOT UPDATE EPISODE')
    },
  })

  const bulkMutation = useMutation<
    { updated: number },
    Error,
    { parentId: string; scope: 'season'; seasonNumber: number; status: WatchStatus }
  >({
    mutationFn: postBulkSeason,
    onSuccess: (data, variables) => {
      invalidateAndRefresh()
      toast.success(
        `SEASON ${variables.seasonNumber} MARKED WATCHED · ${data.updated} EPS`,
      )
    },
    onError: () => {
      toast.error('COULD NOT MARK SEASON')
    },
  })

  function handleToggle(mediaItemId: string, next: WatchStatus) {
    episodeMutation.mutate({ mediaItemId, status: next })
  }

  function handleMarkSeasonWatched(seasonNumber: number) {
    bulkMutation.mutate({
      parentId: showId,
      scope: 'season',
      seasonNumber,
      status: WatchStatus.COMPLETED,
    })
  }

  return (
    <SeasonAccordion
      seasons={seasons}
      defaultExpandedSeason={defaultExpandedSeason}
      onToggleEpisode={handleToggle}
      onMarkSeasonWatched={handleMarkSeasonWatched}
    />
  )
}
