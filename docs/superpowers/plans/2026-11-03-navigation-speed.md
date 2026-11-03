# Navigation Speed Implementation Plan

> For agentic workers: use subagent-driven-development for implementation, followed by spec and quality reviews. Keep this change separate from payment files.

**Goal:** Remove the repeated onboarding round trip that hides the app on each route transition.

**Architecture:** Cache a successful onboarding decision only in the mounted gate for the current signed-in user. Invalidate it on sign-out/account switch and entry into the introduction. Keep the initial eligibility check and existing retry behavior. Replace the full-viewport route loading overlay with an in-content skeleton so shared navigation stays accessible.

**Tech Stack:** Next.js 16, React 19, TypeScript, existing Node component test harness.

## Task 1: Per-account onboarding admission

Files: `web/src/components/OnboardingGate.tsx`, `web/tests/navigation-loading.test.cjs`.

- [x] Write a real-component regression using mutable `useSession` and `usePathname` stubs: returning user visits `/`, `/portfolios`, `/sets`, `/scan`; after the first successful check all subsequent routes render their child immediately and total GET `/api/onboarding` count is one. Confirm it fails on the current component.
- [x] Change path-based success state to user-based success state. Read `session.user.id`; never share an admission decision between users. Keep state local to the mounted gate. Keep initial/new-user eligibility redirects and abort stale requests on account change/unmount.
- [x] Invalidate admission when entering `/onboarding` so completion, skip, and Settings restart cause a fresh check on leaving. Sign-out resets it. Explicit retry clears both success and failure and performs a fresh check. On API failure preserve fail-open behavior and the accessible retry button without causing an effect loop.
- [x] Add regressions for a pending new collector redirect, account A to B, sign-out then A again, Settings restart/introduction return, failed check and retry, bypass routes, and stale response after account switch.

## Task 2: Route loading preserves chrome

Files: `web/src/app/loading.tsx`, same test.

- [x] Replace the fixed full-screen overlay with a lightweight in-content skeleton labeled `Loading page`, using existing skeleton styling. Keep the current shared header and tab bar interactive.
- [x] Render the actual loading component and verify accessible loading status and absence of viewport-covering positioning.

## Verification and review

- [x] Run `node --test tests/navigation-loading.test.cjs tests/onboarding.test.cjs tests/rainbow-mobile.test.cjs` and targeted ESLint. Report exact results and before/after request counts.
- [x] Parent performs spec review, independent quality review, full suite, TypeScript, and production build together with the separate payment change.
- [x] Do not alter application design, pricing, database queries, scanner preparation, or payment files. Do not deploy or modify the original dirty checkout.

Verified: four tab destinations make one onboarding GET rather than four; subsequent admitted routes render immediately. All 241 tests passed (3 optional browser suites skipped), TypeScript, targeted ESLint and the production build passed. Independent spec, quality and combined integration reviews found no remaining actionable issues. Mobile loading UI leaves navigation clickable; the More sheet opens while content is loading.
