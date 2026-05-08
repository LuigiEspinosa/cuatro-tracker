import { withAuth } from 'next-auth/middleware'
import { NextResponse, type NextRequest } from 'next/server'
import { resolveRequestId } from './lib/request-context'

// Export for unit testing without mocking next-auth's JWT layer
export function attachRequestId(req: NextRequest): NextResponse {
  const requestId = resolveRequestId(req.headers.get('x-request-id'))
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-request-id', requestId)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('x-request-id', requestId)
  return response
}

// withAuth reads the JWT cookie and redirects to pages.signIn when missing.
// NEXTAUTH_SECRET is wired in lib/auth.ts via lib/env.ts. Production
// `next build` catches a misconfigured deploy at build time. In dev under
// `next dev --turbopack`, auth routes compile on first /api/auth/* request
// so the Zod summary surfaces then, not at process startup.
export default withAuth(
  function middleware(req) {
    return attachRequestId(req)
  },
  {
    pages: { signIn: '/login' },
  },
)

// ! Each excluded prefix MUST end in (?:/|$) so it anchors to a path-segment
// ! boundary. Bare prefixes over-match: (?!login) excludes /loginz too, which
// ! silently bypasses auth. Same rule applies whenever a new exclusion lands.
// ! Filenames (favicon.ico, robots.txt, sitemap.xml, manifest.webmanifest)
// ! escape the dot so /faviconxico does not match.
// ! The matcher entry MUST be a string literal: Next.js statically parses
// ! config.matcher at build time and silently drops the route if it sees a
// ! const reference. The unit test reads config.matcher[0] at runtime to keep
// ! the regex single-sourced.
export const config = {
  matcher: [
    '/((?!login(?:/|$)|api/auth(?:/|$)|api/health(?:/|$)|api/ready(?:/|$)|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.webmanifest).*)',
  ],
  // ! AsyncLocalStorage requires the Node runtime;
  // ! Edge breaks ALS-based requestId propagation in route handlers.
  runtime: 'nodejs',
}
