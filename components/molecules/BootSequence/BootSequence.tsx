'use client'

import gsap from 'gsap'
import { useCallback, useEffect, useRef, useState } from 'react'
import { readInitialReducedMotion, useReducedMotion } from '@/lib/hooks/useReducedMotion'
import {
  BOOT_COPYRIGHT_LINE,
  BOOT_FINAL_FRAME_NO_WELCOME,
  BOOT_FINAL_FRAME_WITH_WELCOME,
  BOOT_FRAMES,
  BOOT_HEADER_LABEL,
  BOOT_READY_LINE,
  BOOT_VERSION_LINE,
  BOOT_WELCOME_LINE,
  finalCallbackMs,
  progressBar,
  safeTotalDurationMs,
  scaleFrames,
} from './boot-frames'

export type BootSequenceProps = {
  showWelcome?: boolean
  onComplete: () => void
  totalDuration?: number
  reducedMotionOverride?: boolean
  holdAtFrame?: number
  holdReleased?: boolean
  truncate?: boolean
  onTruncate?: () => void
}

const TRUNCATE_TOTAL_MS = 350

const MODIFIER_ONLY_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

export function BootSequence({
  showWelcome = true,
  onComplete,
  totalDuration,
  reducedMotionOverride,
  holdAtFrame,
  holdReleased,
  truncate,
  onTruncate,
}: BootSequenceProps) {
  const initialReduced = readInitialReducedMotion(reducedMotionOverride)
  const reduced = useReducedMotion(reducedMotionOverride)
  const [currentFrame, setCurrentFrame] = useState<number>(() =>
    initialReduced ? BOOT_FINAL_FRAME_NO_WELCOME : 1
  )
  const completedRef = useRef(false)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const holdReleasedRef = useRef(holdReleased ?? false)
  const totalMs = safeTotalDurationMs(totalDuration)

  useEffect(() => {
    holdReleasedRef.current = holdReleased ?? false
  }, [holdReleased])

  const fireComplete = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    onComplete()
  }, [onComplete])

  useEffect(() => {
    if (!reduced) return
    setCurrentFrame(BOOT_FINAL_FRAME_NO_WELCOME)
    if (typeof holdAtFrame === 'number' && !holdReleased) return
    const raf = requestAnimationFrame(() => fireComplete())
    return () => cancelAnimationFrame(raf)
  }, [reduced, fireComplete, holdAtFrame, holdReleased])

  useEffect(() => {
    if (reduced) return
    const scaled = scaleFrames(BOOT_FRAMES, totalMs)
    const lastFrame = showWelcome ? BOOT_FINAL_FRAME_WITH_WELCOME : BOOT_FINAL_FRAME_NO_WELCOME
    const shouldHold =
      typeof holdAtFrame === 'number' &&
      Number.isFinite(holdAtFrame) &&
      holdAtFrame >= 1 &&
      holdAtFrame < lastFrame
    const tl = gsap.timeline()
    timelineRef.current = tl
    for (const frame of scaled) {
      if (frame.index > lastFrame) break
      tl.call(
        () => setCurrentFrame(frame.index),
        undefined,
        frame.startMs / 1000
      )
      if (shouldHold && frame.index === holdAtFrame) {
        tl.call(() => {
          if (!holdReleasedRef.current) tl.pause()
        })
      }
    }
    tl.call(fireComplete, undefined, finalCallbackMs(showWelcome, totalMs) / 1000)
    return () => {
      tl.kill()
      timelineRef.current = null
    }
  }, [reduced, showWelcome, totalMs, fireComplete, holdAtFrame])

  useEffect(() => {
    if (reduced) return
    if (typeof holdAtFrame !== 'number') return
    if (!holdReleased) return
    timelineRef.current?.resume()
  }, [reduced, holdAtFrame, holdReleased])

  useEffect(() => {
    if (reduced) return
    let rafId: number | null = null
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.isComposing) return
      if (MODIFIER_ONLY_KEYS.has(e.key)) return
      if (truncate) return
      if (typeof holdAtFrame === 'number' && !holdReleasedRef.current) return
      const finalFrame = showWelcome ? BOOT_FINAL_FRAME_WITH_WELCOME : BOOT_FINAL_FRAME_NO_WELCOME
      timelineRef.current?.kill()
      timelineRef.current = null
      setCurrentFrame(finalFrame)
      if (rafId !== null) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => fireComplete())
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [reduced, showWelcome, fireComplete, holdAtFrame, truncate])

  const truncatedRef = useRef(false)
  useEffect(() => {
    if (!truncate) {
      truncatedRef.current = false
      return
    }
    if (truncatedRef.current) return
    truncatedRef.current = true
    timelineRef.current?.kill()
    timelineRef.current = null
    if (!onTruncate) return
    if (reduced) {
      const raf = requestAnimationFrame(() => onTruncate())
      return () => cancelAnimationFrame(raf)
    }
    const timer = window.setTimeout(() => onTruncate(), TRUNCATE_TOTAL_MS)
    return () => window.clearTimeout(timer)
  }, [truncate, onTruncate, reduced])

  const showHeader = currentFrame >= 2
  const showVersion = currentFrame >= 3
  const showCopyright = currentFrame >= 4
  const showProgress = currentFrame >= 5
  const showReady = currentFrame >= 9
  const showWelcomeLine = currentFrame >= 10 && showWelcome

  const cls = truncate ? 'bs bs-truncating' : 'bs'

  return (
    <div
      className={cls}
      role='status'
      aria-live='polite'
      aria-label='System boot sequence'
      data-frame={currentFrame}
      data-truncating={truncate ? 'true' : undefined}
    >
      {showHeader && (
        <div className='bs-header' aria-hidden='true'>
          <span className='bs-blocks'>
            <span className='bs-b1'>▓</span>
            <span className='bs-b2'>▓</span>
            <span className='bs-b3'>▓</span>
          </span>
          <span className='bs-label'>{BOOT_HEADER_LABEL}</span>
          <span className='bs-blocks'>
            <span className='bs-b3'>▓</span>
            <span className='bs-b2'>▓</span>
            <span className='bs-b1'>▓</span>
          </span>
        </div>
      )}
      {showVersion && <div className='bs-version'>{BOOT_VERSION_LINE}</div>}
      {showCopyright && <div className='bs-copyright'>{BOOT_COPYRIGHT_LINE}</div>}
      {showProgress && <div className='bs-progress'>{`[${progressBar(currentFrame)}]`}</div>}
      {showReady && <div className='bs-ready'>{BOOT_READY_LINE}</div>}
      {showWelcomeLine && <div className='bs-welcome'>{BOOT_WELCOME_LINE}</div>}
    </div>
  )
}
