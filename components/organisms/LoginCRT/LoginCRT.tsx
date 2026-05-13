'use client'

import type { FormEvent } from 'react'
import { BitmapText } from '@/components/atoms/BitmapText'
import { CRTPixelButton } from '@/components/atoms/CRTPixelButton'
import { TerminalInput } from '@/components/atoms/TerminalInput'
import { CRTBezel } from '@/components/molecules/CRTBezel'

export type LoginCRTProps = {
  onSubmit: (data: { email: string; password: string }) => Promise<void> | void
  error?: string | null
  pending?: boolean
  defaultEmail?: string
  reducedMotionOverride?: boolean
}

export function LoginCRT({
  onSubmit,
  error,
  pending = false,
  defaultEmail = 'admin@tracker.local',
  reducedMotionOverride,
}: LoginCRTProps) {
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    void onSubmit({ email, password })
  }

  return (
    <CRTBezel>
      <div className='lc-screen'>
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

        <form className='lc-form' onSubmit={handleSubmit} noValidate>
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
            name='password'
            type='password'
            label='PASSWORD'
            required
            autoComplete='current-password'
            reducedMotionOverride={reducedMotionOverride}
          />
          {error ? (
            <BitmapText size={18} tone='magenta' as='p' className='lc-error'>
              {error}
            </BitmapText>
          ) : null}
          <CRTPixelButton type='submit' disabled={pending}>
            {'> LOG IN'}
          </CRTPixelButton>
        </form>
      </div>
    </CRTBezel>
  )
}
