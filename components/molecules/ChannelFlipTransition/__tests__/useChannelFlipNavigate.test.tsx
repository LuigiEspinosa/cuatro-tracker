import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useChannelFlipNavigate, type UseChannelFlipNavigateOptions } from '../useChannelFlipNavigate'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  pushMock.mockReset()
})

type HookHarnessHandle = {
  navigate: ReturnType<typeof useChannelFlipNavigate>['navigate']
}

function HookHarness({
  options,
  handleRef,
}: {
  options: UseChannelFlipNavigateOptions
  handleRef: { current: HookHarnessHandle | null }
}) {
  const { navigate, overlay } = useChannelFlipNavigate(options)
  handleRef.current = { navigate }
  return <>{overlay}</>
}

describe('useChannelFlipNavigate reduced-motion branch (AC-2)', () => {
  it('calls router.push synchronously and resolves the promise', async () => {
    const handleRef: { current: HookHarnessHandle | null } = { current: null }
    render(<HookHarness options={{ reducedMotionOverride: true }} handleRef={handleRef} />)
    let resolved = false
    await act(async () => {
      const navigatePromise = handleRef.current!.navigate('/dashboard')
      expect(pushMock).toHaveBeenCalledWith('/dashboard')
      await navigatePromise
      resolved = true
    })
    expect(resolved).toBe(true)
    expect(pushMock).toHaveBeenCalledTimes(1)
  })

  it('does not mount the overlay in reduced-motion mode', async () => {
    const handleRef: { current: HookHarnessHandle | null } = { current: null }
    render(<HookHarness options={{ reducedMotionOverride: true }} handleRef={handleRef} />)
    await act(async () => {
      await handleRef.current!.navigate('/anywhere')
    })
    expect(document.body.querySelector('.cft')).toBeNull()
  })
})

describe('useChannelFlipNavigate animated branch (AC-1, AC-3)', () => {
  it('calls router.push after the band sweep completes (at midpoint of the cycle)', async () => {
    const handleRef: { current: HookHarnessHandle | null } = { current: null }
    render(
      <HookHarness
        options={{ reducedMotionOverride: false, totalDuration: 60 }}
        handleRef={handleRef}
      />
    )
    expect(pushMock).not.toHaveBeenCalled()
    await act(async () => {
      await handleRef.current!.navigate('/timeline')
    })
    expect(pushMock).toHaveBeenCalledWith('/timeline')
    expect(pushMock).toHaveBeenCalledTimes(1)
  }, 5000)

  it('promise resolves after the full transition cycle (not at midpoint)', async () => {
    const handleRef: { current: HookHarnessHandle | null } = { current: null }
    render(
      <HookHarness
        options={{ reducedMotionOverride: false, totalDuration: 60 }}
        handleRef={handleRef}
      />
    )
    let resolved = false
    await act(async () => {
      await handleRef.current!.navigate('/library')
      resolved = true
    })
    expect(resolved).toBe(true)
  }, 5000)
})

describe('useChannelFlipNavigate cleanup on unmount (AC-1, AC-2)', () => {
  it('does not call router.push after the component unmounts mid-flight', async () => {
    const handleRef: { current: HookHarnessHandle | null } = { current: null }
    const { unmount } = render(
      <HookHarness
        options={{ reducedMotionOverride: false, totalDuration: 60 }}
        handleRef={handleRef}
      />
    )
    handleRef.current!.navigate('/dropped')
    unmount()
    // wait well past the band-sweep boundary (20ms) so the un-killed timeline would have pushed by now
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(pushMock).not.toHaveBeenCalled()
  }, 5000)
})
