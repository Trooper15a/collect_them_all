# Binder and set tracking implementation plan

**Goal:** Make binder terminology and owned-copy values consistent, fix owned-set filtering, and add the approved My sets and missing-card alert flow.

**Architecture:** Reuse existing portfolio storage and URLs while standardizing the visible name Binder. Pure helpers own finish-specific valuation, set identity, and alert comparisons. Shared client components compose the binder and set views; authenticated handlers enforce scope.

**Tech stack:** Next.js 16.3.4, React 19, TypeScript, Drizzle/PostgreSQL, existing Node/VM test harnesses.

## 1. Reproduce and fix owned-copy prices

- [x] Add failing handler/UI regressions for an LP Normal item whose Holo quote appears first, unknown finish prices, variant-specific history, and cross-account item IDs.
- [x] Extract `unitValue` into `web/src/lib/valuation.ts`, re-export it from portfolio.ts, and use the same calculation in card detail. Add authenticated `itemId` context to the card handler, including binder metadata and the saved item fields.
- [x] Link binder items with `?itemId=<id>`, show finish/condition on their cards, select that finish in detail, fetch its matching market history, and label estimated per-copy and quantity values.
- [x] Run `node --test tests/binder-values.test.cjs tests/interface-regressions.test.cjs tests/security.test.cjs`.

## 2. Fix set identity and scoped completion

- [x] Add failing fixtures for numeric set IDs versus codes, mixed case, duplicated source records, selected binders, and forbidden binders.
- [x] Add shared identity/number helpers in `web/src/lib/set-identity.ts`. Use canonical game/code/language keys in list API/UI; use case-insensitive game/code/language identity in detail.
- [x] Validate optional positive `binderId` and enforce the signed-in owner's scope. Deduplicate numbers without conflating distinct suffixes or variants; count unique owned cards and preserve summed quantities. Return catalog coverage information.
- [x] Run `node --test tests/binder-sets.test.cjs tests/security.test.cjs`.

## 3. Compose My sets and unify terminology

- [x] Reuse `web/src/components/SetBrowser.tsx` for catalog and owned-set views, preserving set-name/code search, game/language filters, loading/error handling, and descriptive empty states.
- [x] Add Binders/My sets tabs to `/portfolios`, a binder selector defaulting to all binders, and a scoped Sets link on individual binder pages. Preserve scope on set detail/back links and offer a missing-card name/number filter.
- [x] Replace user-facing Portfolio labels with Binder across collection dialogs, pages, import help, and admin displays. Keep technical field names and compatibility paths.
- [x] Verify navigation/filter behavior and rerun onboarding/interface tests.

## 4. Add directional missing-card alerts

- [x] Add failing tests for Drop/Rise/Either, exact threshold boundaries, absent/zero quotes, currency mismatch, stable edit baselines, and ownership.
- [x] Add `alerts.direction` with default `either` to schema and idempotent migration. Extend API validation and alert views. Reject arming unpriced singles and preserve the baseline on threshold-only edits.
- [x] Build `web/src/components/PriceAlertControl.tsx` for finish, percentage, direction, baseline, save/remove/reset. Integrate it into card detail and missing singles, and add bulk watch for the set's missing singles with clear partial-failure results.
- [x] Update Home's watch labels to show direction and finish, retaining its existing triggered-alert and acknowledgment model.
- [x] Run `node --test tests/binder-alerts.test.cjs tests/security.test.cjs`.

## 5. Validate the integrated result

- [x] Run all `.test.cjs` and `.test.ts` files with the existing tsx-enabled Node runner.
- [x] Generate route types and run `tsc --noEmit --incremental false`; lint changed sources and tests.
- [x] Build with locked dependencies and isolated database settings. Restore only build-generated tracked assets.
- [x] Inspect the running UI with synthetic fixtures; exercise binder scope, missing-card filters, exact-copy values, and alert editing.
- [x] Review the final diff for ownership leaks, accidental payment changes, lost master behavior, and misleading copy. Leave the implementation concrete and reviewable.

## Verification results

- Feature branch starts at current `origin/master` (`477346d`); a final fetch confirmed no newer master commits.
- 120 Node tests passed, including saved-copy finish/condition/quantity/grade, account and binder isolation, mixed-source set totals, zero holdings, baseline stability, directional alerts, and watched unowned-card refresh.
- Route type generation, full TypeScript check, changed-file ESLint, and the production build passed.
- Playwright checked the built app at 390 × 844 using synthetic collection/pricing responses: Binders → My sets → single-binder scope → set-name search → Missing → card-name search → alert create/edit/remove → saved Normal/LP card in CAD. No page errors or horizontal overflow. The browser check found and verified an accessible name fix on binder image links.
- Backend tests execute real handlers against isolated fixtures; live database migration and live market imports were not exercised. The production build used an intentionally unreachable dummy database.
- Independent pricing and sets/alerts spec and quality reviews completed. Findings on provider counts, zero quantities, Home alert management, and PostgreSQL regexp greediness were fixed and rechecked.
