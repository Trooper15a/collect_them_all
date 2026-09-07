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
      const isLoginPage = request.nextUrl.pathname.startsWith("/login");
      if (isLoginPage) return true;
      if (!isLoggedIn) return false;
      return true;
    },
  },
} satisfies NextAuthConfig;
