'use client'

import { useMutation } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { MediaType } from '@prisma/client'

export type AddToLibraryButtonProps = {
  source: 'tmdb' | 'anilist'
  sourceId: number
  type: MediaType
  medium: 'movies' | 'tv' | 'anime' | 'manga'
}

type AddBody = {
  source: AddToLibraryButtonProps['source']
  sourceId: number
  type: MediaType
}

type AddResponse = {
  mediaItem: { id: string }
  merged: boolean
}

async function addToLibrary(body: AddBody): Promise<AddResponse> {
  const res = await fetch('/api/media', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(payload.error ?? `add_failed:${res.status}`)
  }
  return (await res.json()) as AddResponse
}

export function AddToLibraryButton({
  source,
  sourceId,
  type,
  medium,
}: AddToLibraryButtonProps) {
  const router = useRouter()

  const mutation = useMutation<AddResponse, Error, AddBody>({
    mutationFn: addToLibrary,
    onSuccess: (data) => {
      toast.success('ADDED TO LIBRARY')
      router.push(`/${medium}/${data.mediaItem.id}`)
    },
    onError: (err) => {
      const reason =
        err.message.startsWith('add_failed:5') || err.message === 'upstream_failed'
          ? 'Upstream unavailable. Please retry.'
          : err.message === 'unsupported_source_type'
            ? 'This media type is not wired yet.'
            : 'Could not add to library.'
      toast.error('COULD NOT ADD', { description: reason })
    },
  })

  return (
    <button
      type='button'
      className='preview-add-button cpb'
      disabled={mutation.isPending}
      onClick={() => mutation.mutate({ source, sourceId, type })}
    >
      {mutation.isPending ? '> ADDING…' : '> ADD TO LIBRARY'}
    </button>
  )
}
