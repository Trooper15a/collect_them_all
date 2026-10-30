# Card Show

User approved the three-mode proposal and delegated trade defaults on 2026-10-30, explicitly requiring a new tab.

Add `/card-show` and a primary navigation tab alongside existing pages. Reuse catalog search and existing visual tokens. Buy and Sell support multiple cards, editable unit market values, quantities, a cash offer, a 70–90% reference range and an adjustable 80% target. Missing or invalid market values block verdicts rather than counting as zero. Manual entries support graded cards and condition-specific sold comparisons.

Trade starts at 100% market value on both sides. Each side supports cards, cash, and an adjustable valuation percentage. Always distinguish the actual market-value difference from the negotiated difference; cash remains at face value. Balanced means within 5% of the larger side. Show the cash adjustment needed to balance each comparison.

Server loads exchange rates and, for authenticated users, their preferred currency. The calculator is public because its guest operation requires no account records; guests start in USD and use a separate device-local draft. Account settings and signed-in draft keys remain scoped to the signed-in user. Convert all card prices before totaling, without silently assuming unknown exchange rates. Currency changes convert entered cash amounts. Keep catalog source, variant and update date visible, and identify manual overrides. Save validated drafts in localStorage after hydration. Reopening the tab restores the draft. New deal clears only this draft.

Verify valuation math, missing prices, zero values, invalid inputs, mixed currencies, vendor percentages, cash balancing, persistence and navigation. Run TypeScript, targeted ESLint and regression tests.

Local sign-in investigation found missing Google client credentials and an unreachable localhost PostgreSQL service. Guest access allows the calculator and manual card values to work without those services. Live catalog search still depends on PostgreSQL. Verified the actual localhost page renders without a login redirect and calculates a $75 offer against a $100 manual value as 75%. Existing private account routes still require login.

## Photo-first entry

User requested taking pictures instead of manual card entry. Each basket now exposes Take a picture and Upload photo. The camera uses the existing scanner; uploads decode locally and use the same preprocessing/model. A native modal keeps the camera/results in the current deal, pauses live scanning during confirmation and cancels requests on close. Users confirm the exact set/number/language among up to five matches before a catalog price is fetched and the card added to the chosen basket. Missing prices produce a retryable error rather than a guessed value. Native camera tracks stop on exit; uploaded object URLs and image bitmaps are released.

`GET /api/card-show/lookup` returns whitelisted public catalog fields only. Normal operation uses the existing database and scan resolver. Development alone can read the existing `data/collectr.db` catalog in read-only mode when PostgreSQL is unavailable. This fallback selects public card columns only, never account records or costs. Cross-source matches require exact game, language, set and collector number and decline ambiguity. Saved snapshots retain their original price dates and are explicitly labeled.

Verification: browser fixture covers upload, confirmation, automatic price entry, camera handoff, correct trade side, Escape cancellation and scanner failure. Actual localhost + real ONNX model identified `ml/data/images/pokemon/30C_eng/tp-696676.jpg` as Greninja ex (ME: 30th Celebration, 021/128) with 98% similarity and added its saved USD 49.99 reference price. This verifies the full photo flow without a running PostgreSQL service; the price is a saved snapshot, not a newly fetched market quote.
