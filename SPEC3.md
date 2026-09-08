# SPEC3.md — Free-features batch (sealed surfacing, Union Arena, hide-prices, compliance)

Base branch context: worktrees branch off `origin/fix/batch2-ui-qol` (newest code, includes crash fixes). Integration branch: `feat/free-features`. Three workstreams, exclusive file ownership.

## Environment protocol (binding, same as before)
- Create your worktree if missing: `cd /mnt/agents/output/project && git worktree add ~/w3-<name> fix3/<branch>` (use -f if needed). NEVER `git worktree prune`.
- Deps: in YOUR worktree `cd web && npm install --ignore-scripts && npm install --no-save --ignore-scripts @types/better-sqlite3`. NEVER npm on /mnt.
- Validate: `npx tsc --noEmit` + `npx eslint <changed files>` must pass. Commit on YOUR branch only. No push/merge. Restore package-lock.json if npm touched it.
- Read files before editing; match existing code style/tokens (dark theme, card-surface, text-muted, accent).

## WS-SEALED — branch fix3/sealed — surface sealed products

Facts: TCGCSV import already stores sealed products in `cards` table with `rarity="Sealed"` and `metaJson.sealed=true` (see web/src/lib/tcgcsv.ts), with prices + daily price history. They are currently INVISIBLE in the UI (no sealed mention in sets pages). Scanner index intentionally skips sealed (keep that).

Owns: web/src/app/sets/[id]/page.tsx, web/src/app/sets/page.tsx, web/src/components/AddToPortfolioSheet.tsx, web/src/app/portfolios/[id]/page.tsx, web/src/app/cards/[id]/page.tsx, and any api route adjustments strictly needed (web/src/app/api/sets/**, api/search/**) — minimize API changes.

1. First TRACE the data flow: how /api/sets/[id] returns cards, whether sealed products are included or filtered out, how search behaves. Report what you find.
2. **sets/[id] page**: add a "Sealed Products" section (below the card grid, collapsed if none): product image/name, current market price, "+ Add" using the same AddToPortfolioSheet flow as cards (verify the sheet handles sealed: no card number/variant — variant may be "sealed"; disable grade fields for sealed items if the sheet has them).
3. **cards/[id] page**: verify sealed products render sanely (image, price, add-to-portfolio, eBay link); adjust copy that assumes trading cards (e.g., grade sections should hide for sealed items — check metaJson.sealed).
4. **portfolios/[id]**: verify sealed items display correctly in a binder (name, price, qty, gain); fix any card-centric assumptions (e.g., card number display) for sealed rows.
5. **sets list page**: nothing to change unless sealed products break counts — check set totals exclude sealed from "card completion" counts if they currently inflate them.

## WS-GAMES — branch fix3/games — Union Arena + compliance + landing count

Owns: web/src/lib/types.ts, web/src/lib/tcgcsv.ts, web/.env.example, web/src/app/landing/page.tsx, README.md (root), web/README.md, and any Tcg-union exhaustiveness compile errors that surface (e.g., components with per-game maps — fix them minimally).

1. **Add Union Arena**: `Tcg` union += "unionarena"; TCGS entry `{ id: "unionarena", label: "Union Arena", accent: <pick a distinct muted color consistent with the existing palette> }`; TCGCSV_CATEGORIES += `{ id: 81, tcg: "unionarena", language: "eng", label: "Union Arena" }`. Run tsc to find every exhaustive map/switch needing the new member; fix minimally.
2. **Landing page**: update all TCG count claims 13 → 14; add "Union Arena" to the marquee games array. Keep everything else intact.
3. **.env.example**: document `TCGCSV_CATEGORIES` (comma-separated category IDs, default behavior, reference lib/tcgcsv.ts list).
4. **TCGCSV compliance**: in the import loop (lib/tcgcsv.ts), add a ~100ms delay between HTTP requests (their guideline; >10k req/24h risks a ban).
5. **READMEs**: root README.md — the brand is "RipnPull" now: update the title, the "Step 1: Download Collectr" wording (it says the COMPETITOR's name — change to "Download the code"), and any "no limit" TCGCSV claim → note the 10k/day guideline. web/README.md similar brand pass if needed.

## WS-TOGGLES — branch fix3/toggles — hide-prices toggle

Owns: web/src/components/ui.tsx, web/src/app/settings/page.tsx, and a NEW file web/src/lib/ui-prefs.ts (or .tsx). Nothing else.

1. **web/src/lib/ui-prefs.ts**: client-side preference helpers — `getHidePrices(): boolean`, `setHidePrices(v)`, both try/catch-wrapped localStorage ("rnp-hide-prices"), plus a tiny `useHidePrices()` React hook that re-renders on change (storage event + custom event for same-tab updates).
2. **ui.tsx**: `Money` and `Delta` components — when hide-prices is on, render "•••" (muted) instead of amounts (and neutral sign for Delta). Keep layout stable (no shift). Everything else in ui.tsx untouched.
3. **settings/page.tsx**: add a "Hide prices" toggle (in an appropriate section, e.g., near display/theme settings) using the same toggle styling as existing settings; persists via ui-prefs; no DB/schema changes.

## Validation & reporting (all)
tsc + eslint pass → commit with clear message on your branch → report per-item status, validation output, deviations.
