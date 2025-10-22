import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized({ token, req }) {
      if (req.nextUrl.pathname.startsWith("/watchlist")) return !!token;
      return true;
    },
  },
});

export const config = { matcher: ["/watchlist/:path*"] };
