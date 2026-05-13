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
}

const MODIFIER_ONLY_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

export function BootSequence({
  showWelcome = true,
  onComplete,
  totalDuration,
  reducedMotionOverride,
}: BootSequenceProps) {
  const initialReduced = readInitialReducedMotion(reducedMotionOverride)
  const reduced = useReducedMotion(reducedMotionOverride)
  const [currentFrame, setCurrentFrame] = useState<number>(() =>
    initialReduced ? BOOT_FINAL_FRAME_NO_WELCOME : 1
  )
  const completedRef = useRef(false)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const totalMs = safeTotalDurationMs(totalDuration)

  const fireComplete = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    onComplete()
  }, [onComplete])

  useEffect(() => {
    if (!reduced) return
    setCurrentFrame(BOOT_FINAL_FRAME_NO_WELCOME)
    const raf = requestAnimationFrame(() => fireComplete())
    return () => cancelAnimationFrame(raf)
  }, [reduced, fireComplete])

  useEffect(() => {
    if (reduced) return
    const scaled = scaleFrames(BOOT_FRAMES, totalMs)
    const lastFrame = showWelcome ? BOOT_FINAL_FRAME_WITH_WELCOME : BOOT_FINAL_FRAME_NO_WELCOME
    const tl = gsap.timeline()
    timelineRef.current = tl
    for (const frame of scaled) {
      if (frame.index > lastFrame) break
      tl.call(
        () => setCurrentFrame(frame.index),
        undefined,
        frame.startMs / 1000
      )
    }
    tl.call(fireComplete, undefined, finalCallbackMs(showWelcome, totalMs) / 1000)
    return () => {
      tl.kill()
      timelineRef.current = null
    }
  }, [reduced, showWelcome, totalMs, fireComplete])

  useEffect(() => {
    if (reduced) return
    let rafId: number | null = null
    const handler = (e: KeyboardEvent) => {
      if (e.repeat) return
      if (e.isComposing) return
      if (MODIFIER_ONLY_KEYS.has(e.key)) return
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
  }, [reduced, showWelcome, fireComplete])

  const showHeader = currentFrame >= 2
  const showVersion = currentFrame >= 3
  const showCopyright = currentFrame >= 4
  const showProgress = currentFrame >= 5
  const showReady = currentFrame >= 9
  const showWelcomeLine = currentFrame >= 10 && showWelcome

  return (
    <div
      className='bs'
      role='status'
      aria-live='polite'
      aria-label='System boot sequence'
      data-frame={currentFrame}
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
