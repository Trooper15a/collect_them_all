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
    error: "/auth/error",
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;
      // Normalize double-slash URLs (//landing etc.) with a permanent redirect.
      if (pathname.includes("//")) {
        const url = request.nextUrl.clone();
        url.pathname = pathname.replace(/\/{2,}/g, "/");
        return Response.redirect(url, 301);
      }
      // Public pages (defensive: these are outside the middleware matcher).
      if (
        pathname === "/login" ||
        pathname === "/landing" ||
        pathname === "/privacy" ||
        pathname === "/terms"
      ) {
        return true;
      }
      // The coming-soon shop page is marketing real estate — public.
      if (pathname === "/shop" || pathname.startsWith("/shop/")) {
        return true;
      }
      // Public pages accessible without login.
      if (pathname === "/scan" || pathname.startsWith("/scan/")) {
        return true;
      }
      if (pathname === "/decks" || pathname.startsWith("/decks/")) {
        return true;
      }
      // Public API endpoints (preserve existing public-API behavior).
      if (
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/prices") ||
        pathname.startsWith("/api/tcgcsv") ||
        pathname.startsWith("/api/health") ||
        pathname.startsWith("/api/scan") ||
        pathname.startsWith("/api/search") ||
        pathname.startsWith("/api/resolve") ||
        pathname.startsWith("/api/cards") ||
        pathname.startsWith("/api/sets") ||
        pathname.startsWith("/api/decks/limitless")
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
