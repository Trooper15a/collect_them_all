import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

// Whitelist model: middleware ONLY runs on protected app routes and the API.
// Everything else (robots.txt, sitemap.xml, /landing, /login, /privacy,
// /terms, static assets, unknown URLs) is served directly — unknown URLs get
// a real 404 via not-found.tsx instead of a redirect to /login.
// Exception: the last entry matches any URL containing "//" (including a
// leading double slash, which the matcher sees as a leading "/" after the
// literal delimiter) so the authorized callback can 301 it to the normalized
// single-slash path.
export const config = {
  matcher: [
    "/",
    "/scan/:path*",
    "/portfolios/:path*",
    "/sets/:path*",
    "/settings/:path*",
    "/cards/:path*",
    "/grade/:path*",
    "/import/:path*",
    "/opens/:path*",
    "/trade/:path*",
    "/wishlist/:path*",
    "/api/:path*",
    "/:path(.*//.*|/.*)",
  ],
};
