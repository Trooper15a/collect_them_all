# Binders, owned sets, and missing-card alerts

Approved by the user: My sets lives inside Binders, supports all binders or one binder, and offers owned/missing cards with in-app percentage alerts measured from the price when enabled.

## Behavior

- Use Binder/Binders throughout user-facing collection controls. Preserve existing URLs, API keys, database names, and user-chosen binder names.
- Binder card links carry the saved item ID. Card detail authenticates and checks ownership before returning item context. The primary value uses that item's finish, condition, and grading fields, with the quantity total shown separately. Missing prices remain unavailable rather than borrowing a more expensive finish. Condition/grade adjustments are explicitly estimates.
- Card history follows the displayed finish. General catalog card pages offer an explicit finish selector, prefer Normal, and label market references separately from owned-copy estimates.
- Match sets using normalized game, set code, and language, independent of numeric catalog IDs. Match detail rows case-insensitively, deduplicate equivalent card numbers across sources, preserve actual quantities, and keep account/binder ownership checks in every scoped query.
- Binders has Binders and My sets tabs. My sets defaults to all binders, has a binder selector and set-name search, and links to existing set details with binder context. Individual binder pages link to their own set progress. The existing Sets page remains the full catalog with its owned-only filter.
- Set details show All, Owned, Missing filters, a name/number search, accurate completion, and explicit empty/error states. A partially imported catalog must not claim complete set coverage.
- Missing singles can be watched individually or in bulk. Users choose finish, a positive percentage, and Drop/Rise/Either. Store the current exact-finish market quote and currency as the baseline. No usable quote means no alert can be armed. Existing alerts default to Either. Editing without a new finish preserves the baseline; an explicit reset acknowledges the alert and starts from the current quote.
- Alert triggers compare like currencies and exact finishes. Daily price refresh keeps the existing in-app alert model; the UI explains that checks follow imported prices and does not promise email or push notifications. Existing watch settings are visible and removable from set details and Home.

## Implementation boundaries

Shared pure helpers define valuation, set identity, and direction/threshold evaluation. Server modules retain database access. Reuse a shared set browser and a shared price-alert control. Add a backward-compatible alerts.direction column through an idempotent startup migration and SQL migration source. Do not touch payments or Premium.

## Verification

Tests cover mismatched numeric set IDs, mixed-case codes, duplicates across sources, zero/multiple quantity, partial catalogs, binder/account isolation, exact-finish values and history, missing-price handling, drop/rise/either thresholds, stable baselines, and UI navigation. Run the complete suite, full type checking, lint on changed files, and a normal production build. Check browser filters, keyboard controls, and the owned-copy price presentation with synthetic fixtures.
