import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'

// Co-located augmentation: session.user.id is set in the jwt + session callbacks below.
declare module 'next-auth' {
  interface Session {
    user: { id: string; email: string; name?: string | null }
  }
}

// Exported separately so unit tests can call it without importing the full NextAuth config.
// db.user.findUnique throws when Postgres is down -> sign-in returns HTTP 500
// A try/catch here would let us return null instead, but masking infra erros silently is worse.
export async function authorizeCredentials(
  credentials: Record<'email' | 'password', string> | undefined,
): Promise<{ id: string; email: string; name: string | null } | null> {
  if (!credentials?.email || !credentials?.password) return null

  const user = await db.user.findUnique({
    where: { email: credentials.email },
    select: { id: true, email: true, name: true, password: true },
  })

  if (!user?.password) return null

  const isValid = await bcrypt.compare(credentials.password, user.password)
  return isValid
    ? { id: user.id, email: user.email ?? '', name: user.name }
    : null
}

/**
 * TODO: NextAuth v4 -> Auth.js v5 is a breaking rewrite;
 * Config shape, adapter API, and session callbacks all change.
 * Pin next-auth to v4 until ready to migrate.
 */
export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: authorizeCredentials,
    }),
  ],
  pages: { signIn: '/login' },
  callbacks: {
    jwt({ token, user }) {
      // user is only defined on the initial sign-in, not on subsequent JWT refreshes
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (session.user) session.user.id = token.id as string
      return session
    },
  },
}
