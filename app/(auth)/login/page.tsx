'use client'

import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { LoginCRT, type LoginCRTPhase } from '@/components/organisms/LoginCRT'
import { useChannelFlipNavigate } from '@/components/molecules/ChannelFlipTransition/useChannelFlipNavigate'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<LoginCRTPhase>('idle')
  const { navigate, overlay } = useChannelFlipNavigate()

  async function handleSubmit({
    email,
    password,
  }: {
    email: string
    password: string
  }) {
    setError(null)
    setPhase('pending')

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid email or password.')
      setPhase('idle')
      return
    }

    setPhase('success')
  }

  const onBootComplete = useCallback(async () => {
    await navigate('/')
    router.refresh()
  }, [navigate, router])

  return (
    <main className='lc'>
      <LoginCRT
        onSubmit={handleSubmit}
        error={error}
        phase={phase}
        onBootComplete={onBootComplete}
        channelFlipOverlay={overlay}
      />
    </main>
  )
}
