import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChapterVolumeTracker } from '../ChapterVolumeTracker'
import { CHAPTERS_PER_VOLUME } from '@/lib/constants/manga'

describe('ChapterVolumeTracker', () => {
  it('renders the chapter row with progress and total', () => {
    render(
      <ChapterVolumeTracker
        chapterCount={150}
        volumeCount={15}
        progress={42}
        volumeProgress={4}
        lifecycleStatus='FINISHED'
        onUpdate={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Chapter progress')).toBeTruthy()
    expect(screen.getByText(/42 \/ 150 CHAPTERS/)).toBeTruthy()
  })

  it('renders the volume row only when volumeCount > 0', () => {
    const { rerender } = render(
      <ChapterVolumeTracker
        chapterCount={150}
        volumeCount={null}
        progress={10}
        volumeProgress={0}
        lifecycleStatus={null}
        onUpdate={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('Volume progress')).toBeNull()

    rerender(
      <ChapterVolumeTracker
        chapterCount={150}
        volumeCount={15}
        progress={10}
        volumeProgress={1}
        lifecycleStatus={null}
        onUpdate={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Volume progress')).toBeTruthy()
    expect(screen.getByText(/1 \/ 15 VOLUMES/)).toBeTruthy()
  })

  it('+1 chapter calls onUpdate with progress + 1 and unchanged volumeProgress', () => {
    const onUpdate = vi.fn()
    render(
      <ChapterVolumeTracker
        chapterCount={150}
        volumeCount={15}
        progress={5}
        volumeProgress={0}
        lifecycleStatus={null}
        onUpdate={onUpdate}
      />,
    )
    fireEvent.click(
      screen.getByLabelText('Increment chapter progress by one'),
    )
    expect(onUpdate).toHaveBeenCalledWith({ progress: 6, volumeProgress: 0 })
  })

  it('-1 chapter is disabled at progress 0', () => {
    const onUpdate = vi.fn()
    render(
      <ChapterVolumeTracker
        chapterCount={150}
        volumeCount={15}
        progress={0}
        volumeProgress={0}
        lifecycleStatus={null}
        onUpdate={onUpdate}
      />,
    )
    const dec = screen.getByLabelText(
      'Decrement chapter progress by one',
    ) as HTMLButtonElement
    expect(dec.disabled).toBe(true)
    fireEvent.click(dec)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it('MARK VOLUME N COMPLETE jumps both axes', () => {
    const onUpdate = vi.fn()
    render(
      <ChapterVolumeTracker
        chapterCount={150}
        volumeCount={15}
        progress={5}
        volumeProgress={0}
        lifecycleStatus={null}
        onUpdate={onUpdate}
      />,
    )
    fireEvent.click(screen.getByLabelText('Mark volume 1 complete'))
    expect(onUpdate).toHaveBeenCalledWith({
      progress: CHAPTERS_PER_VOLUME,
      volumeProgress: 1,
    })
  })

  it('MARK VOLUME N COMPLETE hides when volumeProgress equals volumeCount', () => {
    render(
      <ChapterVolumeTracker
        chapterCount={150}
        volumeCount={15}
        progress={150}
        volumeProgress={15}
        lifecycleStatus={null}
        onUpdate={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText(/Mark volume \d+ complete/)).toBeNull()
  })

  it('shows ONGOING chip when lifecycleStatus is RELEASING', () => {
    render(
      <ChapterVolumeTracker
        chapterCount={150}
        volumeCount={15}
        progress={5}
        volumeProgress={0}
        lifecycleStatus='RELEASING'
        onUpdate={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Status: ongoing')).toBeTruthy()
  })

  it('hides ONGOING chip for finished manga', () => {
    render(
      <ChapterVolumeTracker
        chapterCount={150}
        volumeCount={15}
        progress={5}
        volumeProgress={0}
        lifecycleStatus='FINISHED'
        onUpdate={vi.fn()}
      />,
    )
    expect(screen.queryByLabelText('Status: ongoing')).toBeNull()
  })

  it('volume +1 calls onUpdate with progress unchanged and volumeProgress + 1', () => {
    const onUpdate = vi.fn()
    render(
      <ChapterVolumeTracker
        chapterCount={150}
        volumeCount={15}
        progress={42}
        volumeProgress={3}
        lifecycleStatus={null}
        onUpdate={onUpdate}
      />,
    )
    fireEvent.click(
      screen.getByLabelText('Increment volume progress by one'),
    )
    expect(onUpdate).toHaveBeenCalledWith({ progress: 42, volumeProgress: 4 })
  })

  it('volume +1 is disabled when volumeProgress equals volumeCount', () => {
    render(
      <ChapterVolumeTracker
        chapterCount={150}
        volumeCount={15}
        progress={150}
        volumeProgress={15}
        lifecycleStatus={null}
        onUpdate={vi.fn()}
      />,
    )
    const inc = screen.getByLabelText(
      'Increment volume progress by one',
    ) as HTMLButtonElement
    expect(inc.disabled).toBe(true)
  })
})
