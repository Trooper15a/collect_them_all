# Stripe Checkout setup

RipnPull uses Stripe-hosted Checkout for the proposed US$4.99 one-time offer. The post-beta access policy is still a draft. This integration does not restrict current app access, and beta remains free. Pricing and access decisions can change independently: no feature gates depend on the payment implementation yet.

## Configuration

Payment settings are server-only. The Stripe SDK is loaded lazily; missing credentials do not prevent builds or unrelated app routes from working. Purchases are disabled by default.

Copy the names from `web/.env.example` into your ignored `web/.env.local` for development:

```dotenv
PAYMENTS_ENABLED=false
STRIPE_MODE=test
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
STRIPE_APP_URL=http://localhost:3000
```

Use the dedicated RipnPull sandbox and its test key. Create an active, non-recurring USD price of 499 cents, then set `STRIPE_PRICE_ID` to that price. Keep secret values out of source control, screenshots and logs. No publishable key or Stripe.js dependency is needed for a hosted redirect.

`STRIPE_APP_URL` is the trusted return origin, not a value from a request header. HTTPS is required for live use. HTTP is accepted only for a loopback host in test mode. Set `PAYMENTS_ENABLED=true` only after the price, server key and webhook signing secret are configured in the intended environment.

## Local webhook forwarding

Authorize the CLI for the RipnPull sandbox, then verify the active account:

```powershell
stripe --project-name ripnpull login
stripe --project-name ripnpull whoami
stripe --project-name ripnpull listen --latest --events checkout.session.completed,checkout.session.async_payment_succeeded --events-from '@self' --forward-to http://localhost:3000/api/stripe/webhook
```

Copy the listener's signing secret directly into the private local `STRIPE_WEBHOOK_SECRET` value. Restart the application after changing its environment. The local review fixture uses port 3040, so its origin and forwarding URL both use `http://127.0.0.1:3040`.

The browser-session middleware allows only the exact webhook endpoint anonymously. The route verifies the Stripe signature over the untouched raw request body; a browser login is not the webhook's authentication method.

## Purchase and verification

- `/pricing` shows signed-out, unavailable, test, checkout, error/retry and already-purchased states.
- Authenticated `POST /api/stripe/checkout` requires the configured same origin and a UUID `Idempotency-Key`. The same browser attempt reuses this key on retries. The server supplies price, quantity, account metadata, mode and return URLs.
- Stripe Checkout owns payment details. The application never handles card numbers.
- `/premium/success?session_id=...` checks the session with the server. Visiting this URL alone does not activate access or claim that payment succeeded.
- Both the return page and webhook retrieve the current Stripe Checkout session and line items. They require the app's purchase marker, the signed-in account when applicable, consistent environment, one expected item, USD 499-cent subtotal, and a paid completed session.
- Sandbox confirmation returns `test_paid`. It does not set production `users.premium` or overwrite a production Stripe customer association.
- Verified live purchases use the associated live Stripe customer to update Premium idempotently, retaining the original purchase timestamp. Database failures return a retryable webhook error. A failed schema initialization is retried on a later request.
- Disabling new purchases does not stop fulfillment of existing valid paid sessions.

The pinned Stripe Node SDK is 23.1.0 and uses its matching default API version, `2026-10-28.endive`. Set the deployed webhook endpoint to the matching snapshot event version when configuring it.

## Before live release

The current code and local setup are a test integration, not a production billing launch. Before enabling real purchases, settle the post-beta access policy and purchase wording, configure the separate RipnPull live account and matching live price/key, register the HTTPS webhook endpoint, and verify the actual Auth.js/PostgreSQL flow in staging. The local review fixture uses a simulated app identity and no database; it verifies real sandbox Stripe requests but cannot prove production authentication or storage connectivity.

Confirm applicable tax handling, refund/dispute policy and access behavior before launch. This initial integration neither automatically revokes access on refunds nor adds subscriptions. Those policies should follow the owner's chosen offer. Keep live payments disabled until these decisions and release checks are complete.

Stripe Projects manages infrastructure provisioning and has a separate authorization flow. Payment development uses the already authorized Stripe sandbox; it does not require provisioning new hosting, databases or paid infrastructure.

## Verification

```powershell
cd web
node --test tests/stripe-payments.test.cjs tests/stripe-ui.test.cjs
npm run typecheck
npm run build
```

The tests cover missing configuration, authoritative pricing and ownership, test/live isolation, pending and duplicate events, signed raw bodies and forged signatures, retry recovery, guest and cross-origin rejection, middleware scope, and purchase UI states. Three existing browser suites are optional unless their browser module is installed.

Verified on this branch: 241 tests passed with 3 optional browser suites skipped; TypeScript, targeted ESLint and production build passed. The real sandbox service created an unpaid Checkout session, then the official Stripe CLI test-fixture flow completed it with a dummy Visa token. Stripe delivered `checkout.session.completed` to the local route with HTTP 200; subsequent verification returned `test_paid`, `testMode: true`, `premium: false`. Mobile layouts were checked at 320px and 390px without horizontal overflow. Independent spec, quality and integration reviews found no remaining actionable issues.
