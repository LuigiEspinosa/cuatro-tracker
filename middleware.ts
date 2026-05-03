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
// If NEXTAUTH_SECRET is wrong or missing, all JWTs fail to verify
// and every authenticated user gets redirected to /login in a loop.
export default withAuth(
  function middleware(req) {
    return attachRequestId(req)
  },
  {
    pages: { signIn: '/login' },
  },
)

export const config = {
  // Protect every route except:
  //    /login          - the sign-in page itself
  //    /api/auth       - NextAuth internal endpoints (session, csrf, providers)
  //    /_next/static   - JS/CSS bundles
  //    /_next/image    - image optimisation
  //    /favicon
  matcher: [
    '/((?!login|api/auth|api/health|api/ready|_next/static|_next/image|favicon\\.ico).*)',
  ],
  // ! AsyncLocalStorage requires the Node runtime;
  // ! Edge breaks ALS-based requestId propagation in route handlers.
  runtime: 'nodejs',
}
