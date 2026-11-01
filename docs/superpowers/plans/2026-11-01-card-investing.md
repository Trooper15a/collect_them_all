# Card Investing Implementation Plan

**Goal:** Discover Pokémon market movements and assess a card-show offer in the existing calculator.

**Architecture:** Pure screening rules feed a public catalog API and market board. Card Show reuses its existing asking price and stores optional source/variant metadata without invalidating drafts.

**Tech Stack:** Next.js App Router, React, TypeScript, Drizzle/PostgreSQL, existing Recharts and Node test runner.

- [x] Add failing behavioral tests in `web/tests/investing.test.cjs` for baseline dates, data freshness, risk gates, ranking and actual-offer decisions. Run `node --test tests/investing.test.cjs` in `web` and confirm missing feature assertions fail.
- [x] Implement `web/src/lib/investing.ts` with exact source/variant references, valid dated observations, explicit screening thresholds and pure offer decisions. Run the behavioral tests.
- [x] Implement `web/src/lib/investing-catalog.ts` with a PostgreSQL aggregate per variant and source, excluding sealed products and duplicate noncanonical catalog entries. Add validated public routes `web/src/app/api/investing/route.ts` and `web/src/app/api/investing/card/route.ts`; no account data or provider refresh side effects.
- [x] Implement `web/src/components/investing/Investing.tsx` and `/investing/page.tsx` using existing theme tokens, responsive controls and actual baseline dates. Include retry and honest empty states. Link selected cards to Card Show using ID, source and variant query parameters.
- [x] Extend `web/src/components/card-show/draft.ts` price options with optional source/variant/metric fields. Add `MarketCheck.tsx`, wire it into Buying, reuse asking amount and target, handle quantities and condition confirmation, and preserve manual and multi-card calculations. Add abortable query-card import in Card Show.
- [x] Add Card Investing to responsive primary navigation, whitelist only exact public catalog API routes and page, add the middleware matcher, and link from Card Show to Investing.
- [x] Run `npm run typecheck`, targeted ESLint, pure and API regression tests, and a deterministic mobile UI fixture test. Inspect the resulting diff; record any environment limitations.

Rules are transparent heuristics: fresh means within 72 hours; baseline tolerance is six days; adequate history requires at least five positive observations and a usable 30-day baseline; sharp rise is 20% in seven days or 40% in thirty; sharp decline is 10% in seven or 20% in thirty. A positive offer requires at/below the user's target (default 80%), exact raw comparison confirmation and no risk gates. These thresholds describe screening behavior, not validated predictive performance.

## User refinements and validation

Also delivered Card Lookup alongside Set Lookup under Lookup, with debounced catalog search, global game and language filters, exact-card detail links, retries, loading states and empty results. Public listing pages use existing anonymous catalog APIs; detail pages and private account routes retain their access checks.

Validation: 52 pure/API/account-isolation regressions; the actual catalog SQL executed against an isolated PostgreSQL-compatible engine with dated multi-variant fixtures; a mobile browser fixture covering discovery, offer import, condition confirmation, actual asking-price changes and both lookup views; and a live Chrome check against local PostgreSQL at `http://localhost:3025`. Targeted ESLint and an application-only TypeScript check pass. Full repository TypeScript checking is blocked by the existing migration script's missing optional `better-sqlite3` package; generated route types were refreshed successfully.

Docker Desktop failed during its own startup. The local preview instead uses portable PostgreSQL 16, kept outside the app dependencies in `.brag-tools/local-db`, with a copy of public catalog tables only. Existing SQLite data was opened read-only. The initial seed copied 63,382 cards, 1,852 sets and 958,001 unchanged dated price observations; account and portfolio data were not copied.

On November 1, 2026, refreshed the isolated preview with the app's actual TCGCSV importer for English and Japanese Pokémon: 675 groups, 63,765 products, 57,706 priced products and 67,482 current history rows, with zero errors and six empty groups skipped. Loaded actual provider archives dated October 25 (67,293 matched observations) and October 2 (67,212 matched observations). Historical dates and values were preserved. Cardmarket data was not refreshed by this TCGPlayer import.

Live verification after the refresh: 62,582 market references; with the default minimum USD 5, 18,223 fresh references and 17,966 seven-day comparisons. Seven-day lists contained 4,937 gainers, 3,677 decliners, 14,253 research candidates and 2,959 caution entries. Verified exact source, variant, baseline and percentage calculations against PostgreSQL, ordering for 7/30/90 days, English/Japanese filters and CAD 20–100 budgets. Chrome checks passed at 390×844 and 1440×1000 with no page errors. Card Show produced Good buy on price at 70%, Negotiate at 95% and Pass at 110% of the matching market reference after raw-condition confirmation. Detailed local evidence is saved in `.brag-tools/investing-preview/refreshed-market-test.json`. No source prices were fabricated. No push or merge was performed; local review comes first as requested.

Refreshed the preview's Frankfurter exchange-rate cache with the actual October 30, 2026 reference (USD/CAD 1.3969), replacing the estimated fallback. Re-ran the complete live test successfully with an explicit assertion against fallback rates. CAD 20–100 filters matched 5,557 English and 2,080 Japanese references; the browser's Japanese/CAD filter interaction also passed.

## Offer-check repeat-use correction

Reproduced a saved-basket failure in the user's in-app browser: clicking two different offer links accumulated two buying entries and hid the single-card assessment. Offer links now use `startOfferCheck` to focus one selected card, reset quantity and asking price, and retain a complete nonrecursive `offerBackup` in the validated, account-scoped saved draft. Restore previous deal recovers the original draft, currency, other modes and asking price. Focused market context appears directly below the existing price input.

Verified live in the same in-app browser with a temporary saved deal, successive Zangoose and Deoxys selections, a reload, and restoration of the original test deal and its asking price. Removed the temporary test entries. Left a working one-card research-candidate example open with an empty asking-price input. Three new backup/focus regression tests fail before the change and pass afterward; all 55 selected calculation, API and security regressions pass. Targeted ESLint and the application TypeScript check pass. Screenshot evidence: `.brag-tools/investing-preview/offer-check-fixed.png`. No push or merge.

The offer header now displays the selected card's real catalog artwork next to its name, set, number and language. `OfferCardImage` uses the existing public catalog lookup so previously saved offers work without adding fields to the stored draft or exposing the private image proxy. It aborts outdated lookups when the selected card changes and shows a fallback when art is unavailable. Verified the current saved offer's image loaded in the in-app browser (200px source, displayed at 112px); application TypeScript, targeted lint and 16 draft/calculator regressions pass. Screenshot: `.brag-tools/investing-preview/offer-with-image.png`.
