'use client'

import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { LoginCRT } from '@/components/organisms/LoginCRT'

export default function LoginPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit({
    email,
    password,
  }: {
    email: string
    password: string
  }) {
    setError(null)
    setPending(true)

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    setPending(false)

    if (result?.error) {
      setError('Invalid email or password.')
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <main className='lc'>
      <LoginCRT onSubmit={handleSubmit} error={error} pending={pending} />
    </main>
  )
}
