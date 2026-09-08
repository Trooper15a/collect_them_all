import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

export default {
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      // Public pages (defensive: these are outside the middleware matcher).
      if (
        pathname === "/login" ||
        pathname === "/landing" ||
        pathname === "/privacy" ||
        pathname === "/terms"
      ) {
        return true;
      }
      // Public API endpoints (preserve existing public-API behavior).
      if (
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/prices") ||
        pathname.startsWith("/api/tcgcsv") ||
        pathname.startsWith("/api/health")
      ) {
        return true;
      }
      if (!isLoggedIn) {
        if (pathname === "/") {
          return Response.redirect(new URL("/landing", request.nextUrl.origin));
        }
        return false;
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
