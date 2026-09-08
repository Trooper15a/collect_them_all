# SPEC.md — ripnpull.ca Site-Review Fixes

Single source of truth for the fix branch. Repo: `Trooper15a/collect_them_all` (now PUBLIC), Next.js 16 app in `web/`. Three workstreams on separate branches; file ownership is exclusive — do NOT touch files owned by another workstream.

## Global contracts (binding for all workstreams)

- New file `web/src/lib/site.ts` (owned by WS-INFRA, but everyone may import from it — treat this interface as final):
  ```ts
  export const SITE = {
    name: "RipnPull",
    url: "https://ripnpull.ca",
    description:
      "Free, open-source TCG portfolio tracker with on-device AI card scanning, daily prices across 13 games, and offline support.",
    repoUrl: "https://github.com/Trooper15a/collect_them_all",
    contactUrl: "https://github.com/Trooper15a/collect_them_all/issues",
    tcgCount: 13,
    license: "MIT",
  } as const;
  ```
- New PUBLIC routes (no login required): `/privacy`, `/terms`. Existing public: `/landing`, `/login`.
- Canonical domain: `https://ripnpull.ca`. OG image path: `/og-image.png` (1200×630; binary added at integration — reference it, don't create it).
- TCG count everywhere: **13**. Repo is public → open-source claims stay and should link `SITE.repoUrl`; license is MIT.
- Do not modify: `web/src/db/**`, `web/src/app/api/**` (except nothing), `ml/**`, authenticated page components, `public/sw.js` (except nothing).

## WS-CONTENT — branch `fix/content` — landing copy & accuracy

Owns: `web/src/app/landing/page.tsx` (exclusive).

1. Change all "14 TCGs"/"14 games"/"across 14" claims → 13 (4 occurrences: hero subhead, prices card, TCGs card, comparison section).
2. "Real-Time Prices" card: rename heading to "Up-to-Date Prices"; body keeps "updated daily" wording — remove the real-time/daily contradiction.
3. "Why RipnPull over Collectr?" section → reframe as "Why RipnPull over typical paid trackers?" — replace the named-competitor column with generic "Typical paid trackers" claims that are safely true: "$5–10/mo subscriptions", "Paywalled price history", "Closed source", "No offline mode". RipnPull column: "Free forever", "PSA + BGS + CGC grading links", "Open source (MIT)", "Full offline mode". No company names anywhere in the section.
4. Trademark styling in visible copy: "Pokemon" → "Pokémon", "Weiss Schwarz" → "Weiß Schwarz" (display strings only; don't change keys/ids/slugs).
5. "ONNX-powered recognition" → "on-device AI recognition".
6. Marquee: the duplicated second half of the games list gets `aria-hidden="true"`. Add class hook `marquee-track` to the animated element if not present (WS-UX adds the CSS).
7. Footer: add links — Privacy (`/privacy`), Terms (`/terms`), GitHub (`SITE.repoUrl`), plus line "MIT licensed · Built by collectors, for collectors." Keep existing links working.
8. Keep "View on GitHub" hero CTA and open-source claims (repo is public now).
9. No other structural/design changes.

## WS-INFRA — branch `fix/infra` — middleware, SEO, legal, metadata, headers

Owns: `web/src/middleware.ts`, `web/src/lib/auth.config.ts`, `web/next.config.ts`, `web/src/app/layout.tsx`, `web/src/app/login/page.tsx`, and creates: `web/src/lib/site.ts`, `web/src/app/robots.ts`, `web/src/app/sitemap.ts`, `web/src/app/not-found.tsx`, `web/src/app/privacy/page.tsx`, `web/src/app/terms/page.tsx`.

1. **Middleware → whitelist model** (root cause of robots.txt/sitemap/404 redirecting to login):
   - `config.matcher` protects ONLY: `/`, `/scan/:path*`, `/shop/:path*`, `/portfolios/:path*`, `/sets/:path*`, `/settings/:path*`, `/cards/:path*`, `/grade/:path*`, `/import/:path*`, `/opens/:path*`, `/trade/:path*`, `/wishlist/:path*`, `/api/:path*`.
   - `authorized` callback: allow without auth → `/login`, `/landing`, `/privacy`, `/terms`, and API paths starting `/api/auth`, `/api/prices`, `/api/tcgcsv`, `/api/health` (preserve current public-API behavior). `/` unauthenticated → 302 to `/landing` (current behavior). Everything else in matcher requires auth.
   - Result: unknown public paths no longer hit middleware → Next.js serves `not-found.tsx` with real 404 status.
2. `robots.ts`: allow all, `disallow: ["/api/"]`, sitemap URL.
3. `sitemap.ts`: entries for `/`, `/landing`, `/login`, `/privacy`, `/terms`.
4. `not-found.tsx`: branded 404 page (dark theme tokens, link to `/` and `/landing`).
5. `/privacy` + `/terms`: static SSR pages, professional plain-language drafts for a free, open-source, Canadian (.ca) TCG tracker using Google sign-in. Privacy covers: what data (Google profile email/name, collection data), why, storage, no sale of data, cookies (auth session only), third parties (Google OAuth, TCGPlayer price data), data deletion via settings/contact, contact via `SITE.contactUrl`. Terms covers: service as-is, no warranty, price data accuracy disclaimer, account termination, MIT license note for code, contact. Both pages: shared layout styling consistent with landing (dark theme, max-w-2xl, prose-like spacing), footer links back home, `export const metadata` with titles "Privacy Policy · RipnPull" / "Terms of Service · RipnPull". Effective date: September 2026.
6. `layout.tsx`: remove `maximumScale: 1` from viewport. Expand metadata: `metadataBase: new URL(SITE.url)`, title `{ default: "RipnPull — Free TCG Portfolio Tracker", template: "%s · RipnPull" }`, description from SITE, `openGraph` (type website, url, siteName, title, description, images: `/og-image.png` 1200×630), `twitter: { card: "summary_large_image" }`, keywords. Keep manifest/icons/appleWebApp.
7. `login/page.tsx`: add per-page metadata if it's a server component (if client, add a parent `layout.tsx` for `/login` with metadata instead); add under the sign-in button: "By signing in you agree to the [Terms](/terms) and [Privacy Policy](/privacy)." Keep behavior identical otherwise.
8. `next.config.ts` headers — keep existing COOP/COEP + `/model` cache; ADD on `/(.*)`: `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()`. ADD `/icons/(.*)` → `Cache-Control: public, max-age=604800`. (Camera must stay allowed for the scanner!)

## WS-UX — branch `fix/ux` — install banner, nav, a11y, styles

Owns: `web/src/components/PwaRegister.tsx`, `web/src/components/TabBar.tsx`, `web/src/app/globals.css`.

1. **PwaRegister (install banner):**
   - Persist dismissal: localStorage key `rnp-install-dismissed` storing ISO timestamp; don't show for 14 days after dismissal. Also don't show if app already installed (`window.matchMedia("(display-mode: standalone)")` or `navigator.standalone`).
   - If `beforeinstallprompt` hasn't fired when "Install" is clicked, show inline fallback instructions ("Use your browser menu → 'Install app' / 'Add to Home Screen'") instead of a silent no-op.
   - Decorative "+" element gets `aria-hidden="true"`.
   - Banner must not overlap page content or the TabBar: render it fixed above the tab bar with an 8px gap, and add a body-level spacer or padding so page content isn't covered (coordinate via the `.safe-bottom` utility in globals.css — you own it).
2. **TabBar:**
   - Hide entirely on public pages: `/landing`, `/login`, `/privacy`, `/terms` (use `usePathname`).
   - Add `aria-label="Primary"` to the `<nav>` and `aria-current="page"` on the active link.
   - Ensure main scroll content has bottom padding ≥ nav height so footer content isn't hidden (adjust `.safe-bottom` / main padding in globals.css).
3. **globals.css:**
   - Add global `:focus-visible { outline: 2px solid var(--accent, #4c8dff); outline-offset: 2px; border-radius: 4px; }` (use the real accent token name found in the file).
   - Contrast: find every readable-text use of a 60%-opacity muted style; either bump `--muted` to ~#9aa3b2 or add a `.text-dim` token that passes 4.5:1 on `--bg` (#0a0e1a) and migrate `text-muted/60` usages **only within files you own** (globals.css utilities) — for other files, leave a comment in your report (WS-CONTENT was told to keep marquee readable via class hook).
   - `@media (prefers-reduced-motion: reduce)`: stop `.animate-marquee` / `.marquee-track` animation and `anim-widget` entrance animations.
   - Keep the existing theme/design tokens intact otherwise.

## Validation contract (all workstreams)

- `node_modules` is symlinked into your worktree at `web/node_modules` (shared). If `npx tsc` fails due to incomplete install, wait ~60s and retry — npm install may still be running in the shared repo (check `/tmp/npm-install.log`).
- Before committing: `cd web && npx tsc --noEmit` must pass, and `npx eslint <your changed files>` must pass.
- Commit with a clear message on YOUR branch only. Do not merge, do not push, do not touch other branches.
- Report back: files changed, what you did per spec item, validation output, and any spec deviations with reasons.
