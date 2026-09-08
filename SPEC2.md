# SPEC2.md — Batch 2: UI/QoL fixes + Shop Coming Soon

Base: `origin/master` (PR #1 merged). Three workstreams, exclusive file ownership. Validation protocol at the bottom is binding.

## Canonical shared contracts

### A. Toast v2 (owned by WS-A; everyone else may import `showToast`)
Extend the existing event-bus API — backward compatible:
```ts
showToast(message: string, type?: "up" | "down" | "info",
          opts?: { action?: { label: string; onClick: () => void }; durationMs?: number })
```
Action renders as a bold accent button inside the toast; default duration stays 3500ms, use 6000ms when an action is present.

### B. BackLink (canonical source — create ONLY if absent in your tree, byte-identical; git resolves identical add/add)
`web/src/components/BackLink.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";

export function BackLink({ fallback, label }: { fallback: string; label?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="text-muted text-sm inline-flex items-center min-h-11 -ml-2 px-2 hover:text-fg transition-colors"
      aria-label={label ? `Back to ${label}` : "Back"}
    >
      ‹ {label ?? "Back"}
    </button>
  );
}
```

### C. Destructive-action pattern
Instant deletes become: perform optimistically → `showToast("Deleted", "info", { action: { label: "Undo", onClick: restore }, durationMs: 6000 })` where restore re-POSTs the item. Where restore is impractical (whole binder), keep a confirm but use a styled in-page confirm (not native `confirm()`) and surface API errors via toast.

---

## WS-A "feedback & safety" — branch `fix2/feedback`

Owns: `web/src/components/Toast.tsx`, `SwipeToDelete.tsx`, `BackLink.tsx` (creator), `ui.tsx` (CardImage fallback ONLY), and pages: `portfolios/page.tsx`, `portfolios/[id]/page.tsx`, `cards/[id]/page.tsx`, `opens/page.tsx`, `opens/[id]/page.tsx`, `wishlist/page.tsx`, `sets/page.tsx`, `scan/page.tsx`, `settings/page.tsx`, `grade/page.tsx`.

1. **Toast.tsx**: implement contract A. Wire `showToast` into every mutation you touch below (add/edit/delete/save/refresh) — success ("Added to binder ✓" type "up") and failure ("Save failed — try again" type "down").
2. **Infinite skeletons**: `portfolios/page.tsx`, `opens/page.tsx` — render `error && !data` as `<Empty>` + Retry button before the skeleton branch.
3. **Error≠empty**: `sets/page.tsx` (track error separately; network failure shows error+retry, not "run the import"), `wishlist/page.tsx` (same). Sets filter switching: keep stale list with `opacity-60` instead of `setSets(null)`.
4. **portfolios/[id]/page.tsx**: `EditItemSheet.save()` must check `r.ok` and show error toast on failure (don't close on failure). Replace native `confirm()` binder delete with styled inline confirm + error toast. Swipe-to-delete item → optimistic + Undo toast (re-POST on undo). Portfolio-name `<h1 onClick>` → real `<button>`. Rename input: Enter=save, Esc=cancel, busy state. Card-grid text `<div onClick>` → `<button>` with proper type. Back nav → `<BackLink fallback="/portfolios" label="Binders" />`.
5. **cards/[id]/page.tsx**: back link → `<BackLink fallback="/scan" label="Back" />`. Wishlist toggle: functional setState, debounce/guard double-tap, revert+toast on failure. "Refresh price": toast result ("Price updated" / "Refresh failed"). Zoom button: `aria-label="Zoom card image"` + small caption "Double-tap to zoom". Price-alert sheet: autofocus, validate 1–95, success toast.
6. **opens/[id]/page.tsx**: pull-delete X → Undo toast pattern; `addCard` → success toast; empty-pulls state ("No pulls yet — scan your first card"); consistent ✕ glyph; remove-button min tap target 32px+. Back → `<BackLink fallback="/opens" label="Opens" />`.
7. **wishlist/page.tsx**: ✕ delete → Undo toast. Add PullToRefresh (component exists — mount it like portfolios does).
8. **scan/page.tsx**: bulk "Add all" — check each `r.ok`, collect failures, end with summary toast ("Added 12 cards" / "9 added, 3 failed — kept in queue"); keep failed items in queue. Portfolio picker load failure → visible error instead of silently empty select. "Clear" → confirm. Search input: `autoFocus` + clear ✕ button. `chooseMatch`: show spinner/disabled on tapped row while resolving. Persist `bulkMode` alongside `bulkQueue` in localStorage.
9. **settings/page.tsx**: `patch()` — check `r.ok`, revert on failure, "Saved ✓" toast on success (debounce toasts: only show on explicit user commits, not every keystroke). **Remove the dead `bulkPortfolio` setting** (UI + patch key) — nothing reads it; note removal in report.
10. **grade/page.tsx**: `URL.revokeObjectURL` on retake; "Change" → confirm before discarding; loading cue while refined price loads.
11. **ui.tsx**: `CardImage` — `onError` → neutral placeholder (dark card-back style div, no broken-image icon). Nothing else in this file.
12. **SwipeToDelete.tsx**: add subtle affordance (small chevron/edge hint) and make the delete button min 32px tall. Keep gesture behavior.

## WS-B "nav & trade" — branch `fix2/nav`

Owns: `sets/[id]/page.tsx`, `trade/page.tsx`, `components/PullToRefresh.tsx`, `components/UserMenu.tsx`, `components/Scanner.tsx`, `components/BackLink.tsx` (create byte-identical copy from contract B if absent — do not modify if present).

1. **sets/[id]/page.tsx**: back link → `<BackLink fallback="/sets" label="Sets" />`. Remove dead "rarity" sort branch (identical to price-desc). "+ Add"/"+ More"/"Buy ↗" → min 32px tap targets (slightly larger padding/text).
2. **trade/page.tsx**: persist giving/getting lists to localStorage (key `rnp-trade`), restore on mount, clear via existing reset. Qty −/+ buttons: `aria-label`s + min 32px. CardSearch dropdown: Escape closes, Enter selects first result, `aria-expanded`.
3. **PullToRefresh.tsx**: fix false-trigger — gate on `window.scrollY === 0` instead of the non-scrolling container's `scrollTop`; add light haptic on trigger if the existing haptics lib exposes one.
4. **UserMenu.tsx**: sign-out → styled inline confirm (not native confirm).
5. **Scanner.tsx**: make the live-match preview card tappable (tapping = accept match, same path as "Identify card"), with `role="button"`/keyboard support.

## WS-C "public & shop" — branch `fix2/public`

Owns: `landing/page.tsx`, `login/page.tsx`, `shop/page.tsx`, `app/globals.css`, `app/not-found.tsx`.

1. **Landing header**: minimal top bar inside the column — wordmark "RipnPull" (link to `/landing`) left; "GitHub" + "Sign in" links right; height ~56–64px; consistent with existing tokens; not sticky.
2. **CTA gradient lock**: replace the hue-cycling rainbow gradient on "Get started free" with a static two-stop brand gradient (`#3b82f6 → #60a5fa`), glow shadow tinted to match (`rgba(59,130,246,.35)`). Find the keyframes/animation in globals.css or inline styles and remove/replace.
3. **Marquee polish**: edge fade mask on the marquee container (`mask-image: linear-gradient(to right, transparent, black 8%, black 92%, transparent)`), slow animation ~30% (e.g., 30s→40s). Keep aria-hidden duplicate intact.
4. **Login page redesign**: vertically centered card (min-h-100dvh grid place-items-center), card container matching landing card language (elevated bg, hairline border, 16px radius, ~40px padding), app icon/wordmark above, one reassurance line under the Google button ("We only read your name & email — see Privacy" linking /privacy), and a "← Back to site" link to /landing. Keep sign-in logic untouched; keep the Terms/Privacy line from PR #1.
5. **Shop → Coming Soon**: replace `shop/page.tsx` contents with a clean Coming Soon page: "Shop" heading, short line ("Price comparison across marketplaces is coming soon."), muted note that card pages still link to marketplaces, and a link to GitHub for updates (https://github.com/Trooper15a/collect_them_all). Match app styling (card-surface, tokens). Do NOT touch middleware (shop stays auth-protected) or `lib/marketplace.ts`.
6. **not-found.tsx**: add a second link "Back to home" (→ `/landing`) alongside the dashboard CTA.

## Validation protocol (binding — learned from batch 1)

- Worktree: `/home/kimi/w2-<yours>` (feedback/nav/public). If missing/broken in your namespace: `cd /mnt/agents/output/project && git worktree add ~/w2-<yours> fix2/<branch>`. NEVER run `git worktree prune`.
- Deps: in YOUR worktree: `cd web && rm -f node_modules && npm install --ignore-scripts && npm install --no-save --ignore-scripts @types/better-sqlite3` (~30s). NEVER npm install on /mnt (FUSE mount corrupts it).
- Validate: `npx tsc --noEmit` PASS + `npx eslint <changed files>` PASS. Then `git add -A && git commit` on YOUR branch only. No push, no merge, no prune.
- If npm rewrote package-lock.json, restore it before committing (`git checkout -- web/package-lock.json`) unless you intentionally changed deps (don't).
- Report: files changed, per-item status, validation output, deviations.
