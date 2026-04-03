import { withAuth } from 'next-auth/middleware'

// withAuth reads the JWT cookie and redirects to pages.signIn when missing.
// If NEXTAUTH_SECRET is wrong or missing, all JWTs fail to verify
// and every authenticated user gets redirected to /login in a loop.
export default withAuth({
  pages: { signIn: '/login' },
})

export const config = {
  // Protect every route except:
  //    /login          - the sign-in page itself
  //    /api/auth       - NextAuth internal endpoints (session, csrf, providers)
  //    /_next/static   - JS/CSS bundles
  //    /_next/image    - image optimisation
  //    /favicon
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon\\.ico).*)'],
}
