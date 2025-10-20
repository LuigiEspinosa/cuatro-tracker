import NextAuth, { type AuthOptions } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "./prisma";
import Github from "next-auth/providers/github";

export const authConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  providers: [
    Github({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
    }),
  ],
  callbacks: {
    async session({ session, token }) {
      if (token?.sub) (session.user as any).id = token.sub
      return session
    },
  },
} satisfies AuthOptions

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig)
