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
      const isLoginPage = pathname.startsWith("/login");
      const isLandingPage = pathname === "/landing";
      if (isLoginPage || isLandingPage) return true;
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
