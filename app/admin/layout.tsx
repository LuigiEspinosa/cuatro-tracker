import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getServerSession(authOptions)

  // * Session presence IS the admin gate in v1. `User` has no `role` column and
  // * `Session.user` is not augmented with one, so the epic's literal
  // * `session.user.role === 'admin'` does not compile, and the epic itself says
  // * every authenticated user is the admin here. Do not "fix" this back to a
  // * role check without the migration plus the JWT and session plumbing.
  // * Roads not taken: adding `User.role` now, a schema and auth escalation for a
  // * check that cannot return false while the app is single-user.
  // * Failure mode: if multi-user ever lands, this gate fails open to any
  // * authenticated user and is the first thing that must change.
  //
  // * notFound() not redirect(): a 404 does not confirm an admin surface exists.
  // * This gate is defense in depth. middleware.ts is the load-bearing check
  // * because it runs on every request, whereas a shared layout does not re-run
  // * on client-side navigation between its children.
  if (!session) {
    notFound()
  }

  return (
    <div className='adm-ground'>
      <div className='adm-content'>{children}</div>
    </div>
  )
}
