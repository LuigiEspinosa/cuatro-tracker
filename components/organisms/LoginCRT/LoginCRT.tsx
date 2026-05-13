'use client'

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { BitmapText } from '@/components/atoms/BitmapText'
import { CRTPixelButton } from '@/components/atoms/CRTPixelButton'
import { TerminalInput } from '@/components/atoms/TerminalInput'
import { CRTBezel } from '@/components/molecules/CRTBezel'
import { BootSequence } from '@/components/molecules/BootSequence'
import { StatusBanner } from '@/components/molecules/StatusBanner'

export type LoginCRTPhase = 'idle' | 'pending' | 'success' | 'error-truncating'

export type LoginCRTProps = {
  onSubmit: (data: { email: string; password: string }) => Promise<void> | void
  error?: string | null
  pending?: boolean
  phase?: LoginCRTPhase
  onBootComplete?: () => void
  onBootTruncate?: () => void
  channelFlipOverlay?: ReactNode
  defaultEmail?: string
  reducedMotionOverride?: boolean
}

const ERROR_BANNER_PRIMARY = '> ACCESS DENIED'
const ERROR_BANNER_SECONDARY = 'INVALID EMAIL OR PASSWORD'

export function LoginCRT({
  onSubmit,
  error,
  pending = false,
  phase = 'idle',
  onBootComplete,
  onBootTruncate,
  channelFlipOverlay,
  defaultEmail = 'admin@tracker.local',
  reducedMotionOverride,
}: LoginCRTProps) {
  const isBusy = phase !== 'idle' || pending
  const showBoot = phase === 'pending' || phase === 'success' || phase === 'error-truncating'
  const isTruncating = phase === 'error-truncating'
  const formClass = isBusy ? 'lc-form lc-form-faded' : 'lc-form'
  const screenClass = isTruncating ? 'lc-screen lc-screen-shake' : 'lc-screen'

  const passwordRef = useRef<HTMLInputElement | null>(null)
  const prevErrorRef = useRef<string | null | undefined>(error)

  useEffect(() => {
    if (!error) {
      prevErrorRef.current = error
      return
    }
    if (prevErrorRef.current === error) return
    prevErrorRef.current = error
    if (phase === 'idle') {
      passwordRef.current?.focus()
    }
  }, [error, phase])

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isBusy) return
    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    void onSubmit({ email, password })
  }

  return (
    <CRTBezel>
      <div className={screenClass}>
        <header className='bt-header'>
          <span className='bt-blocks' aria-hidden='true'>
            <span className='bt-b1'>▓</span>
            <span className='bt-b2'>▓</span>
            <span className='bt-b3'>▓</span>
          </span>
          <BitmapText size={30} glow>
            CUATRO TRACKER
          </BitmapText>
          <span className='bt-blocks' aria-hidden='true'>
            <span className='bt-b3'>▓</span>
            <span className='bt-b2'>▓</span>
            <span className='bt-b1'>▓</span>
          </span>
        </header>

        <BitmapText size={20} tone='cream-dim' as='div'>
          VERSION 0.2.0
        </BitmapText>
        <BitmapText size={16} tone='cream-ghost' as='div'>
          (C) CUATRO DEVELOPMENT STUDIO, 2026. ALL RIGHTS RESERVED.
        </BitmapText>

        <form className={formClass} onSubmit={handleSubmit} noValidate>
          <TerminalInput
            name='email'
            type='email'
            label='EMAIL'
            required
            autoComplete='email'
            defaultValue={defaultEmail}
            reducedMotionOverride={reducedMotionOverride}
          />
          <TerminalInput
            ref={passwordRef}
            name='password'
            type='password'
            label='PASSWORD'
            required
            autoComplete='current-password'
            reducedMotionOverride={reducedMotionOverride}
          />
          {error && phase === 'idle' ? (
            <StatusBanner
              variant='error'
              primary={ERROR_BANNER_PRIMARY}
              secondary={ERROR_BANNER_SECONDARY}
            />
          ) : null}
          <CRTPixelButton type='submit' disabled={isBusy}>
            {'> LOG IN'}
          </CRTPixelButton>
        </form>
      </div>
      {showBoot ? (
        <BootSequence
          onComplete={onBootComplete ?? (() => undefined)}
          onTruncate={onBootTruncate ?? (() => undefined)}
          holdAtFrame={9}
          holdReleased={phase === 'success'}
          truncate={isTruncating}
          reducedMotionOverride={reducedMotionOverride}
        />
      ) : null}
      {channelFlipOverlay}
    </CRTBezel>
  )
}
