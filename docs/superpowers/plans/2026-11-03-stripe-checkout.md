# Stripe Checkout Implementation Plan

> For agentic workers: execute test-first in the isolated `codex/performance-stripe` worktree; request independent review before completion.

**Goal:** Provide a working, reviewable US$4.99 one-time purchase integration in the separately authorized RipnPull sandbox.

**Architecture:** Stripe-hosted Checkout, server-owned pricing, signed webhook fulfillment and account-bound payment verification. Payments remain disabled by default. Test purchases must never grant live Premium entitlement. Keep current app access while the owner decides what Premium unlocks. Preserve the user's uncommitted draft in the original checkout.

**Tech Stack:** Stripe Node SDK 23.1.0 (SDK's default API version), Next.js route handlers, Auth.js, Drizzle/PostgreSQL, existing Node tests.

## Task 1: Configuration and server payment service

Files: `web/src/lib/stripe.ts`, `web/src/lib/premium.ts`, new `web/tests/stripe-payments.test.cjs`.

- [x] Write failing tests for disabled/missing configuration, server-owned price/currency, owned session binding, payment mode, mode isolation, wrong price, pending payment, repeated delivery, and unknown customer/user.
- [x] Lazily construct the Stripe client so builds and unrelated routes work without credentials. Use server-only enabled/mode/key/price/origin/webhook settings. Require a configured price and validate it is an active one-time USD 499-cent price. Never accept price, amount or user identity from the checkout body.
- [x] Create Checkout sessions for the authenticated user, with metadata identifying user, purchase kind and environment, `client_reference_id`, quantity one, and server-owned return URLs. Reuse/create a stable Stripe customer through the existing user association; do not invent an `unknown` customer ID.
- [x] Fulfillment retrieves the current Checkout session and its line items from Stripe, verifies account binding, expected product/price/quantity/currency/paid status and environment before updating access. Live and test entitlements remain separate; sandbox verification never updates production `users.premium`. Make entitlement updates idempotent. Return pending, verified-test or purchased status accurately.

## Task 2: Authenticated endpoints and signed webhook

Files: `web/src/app/api/stripe/checkout/route.ts`, `status/route.ts`, `webhook/route.ts`, `web/src/lib/auth.config.ts`, tests.

- [x] Require the signed-in account for checkout and purchase status. Reject cross-origin checkout requests, return no-store responses, and avoid revealing another user's session or internal error details.
- [x] Allow exactly `/api/stripe/webhook` through browser-session middleware; authenticate it using the Stripe signature over the original raw request body. Missing/invalid signatures fail closed. Handle completed and async-success events; retries after storage errors return failure, and unrelated events are acknowledged.
- [x] Test guest checkout/status rejection, forged/missing signatures, wrong path bypass, unpaid/foreign/mismatched sessions, valid paid events and duplicate processing.

## Task 3: Reviewable purchase UI and setup documentation

Files: `web/src/app/pricing/page.tsx`, `web/src/components/PremiumPurchase.tsx`, `web/src/app/premium/success/page.tsx`, `web/.env.example`, setup docs and UI tests.

- [x] Render the actual purchase states: sign-in, not configured, sandbox checkout, busy/error/retry, pending confirmation, successful test payment and confirmed purchase. Never claim success from a query string or page visit. Do not advertise paused grading tools or introduce feature restrictions while the paid feature decision is pending.
- [x] Use the existing Rainbow design, clear USD one-time price and standard Stripe-hosted redirect. Do not add Stripe.js when a server-created hosted URL suffices.
- [x] Document sandbox-only local configuration, webhook forwarding, production setup requirements and disabled-by-default behavior. Do not commit credentials or change production environment variables.

## Task 4: Sandbox verification and completion

- [x] Provision a RipnPull Premium test product and one-time USD 499-cent price in the authorized sandbox, reusing any existing matching objects.
- [x] Create/retrieve a real sandbox Checkout session to verify SDK/CLI account and configured price. Validate signed webhook handling with real SDK-generated signatures and realistic Stripe session fixtures. Never submit a real payment.
- [x] Run all Node tests, TypeScript, targeted ESLint and production build. Get independent spec and code-quality reviews, resolve material findings, and present the concrete local result for review before deployment.
- [x] Record any remaining prerequisite precisely. Stripe Projects infrastructure authorization is separate from the already verified payments CLI authorization; no additional infrastructure or paid services are needed for this Checkout integration.

Verification: 241 tests passed; 3 optional browser suites skipped. TypeScript, targeted ESLint and production build passed. Real sandbox checkout, official test payment fixture, webhook HTTP200 and test_paid confirmation verified with no production access granted. The post-beta access model remains tentative; beta stays free. Independent spec, quality and integration reviews passed after retry and account-switch regression fixes.
