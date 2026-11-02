# Rainbow original Implementation Plan

> Implement and review in isolation from the user's uncommitted scanner, grading, card-show, investing, and catalog work.

**Goal:** Apply the approved Rainbow original mobile design to RipnPull's dashboard and shared app chrome.

**Architecture:** Keep all data fetching, collection features, currencies, privacy preferences, and routes. Replace the floating game picker with a shared app header, use five bottom navigation items with a native More dialog, and restyle the dashboard using neutral surfaces and static pastel rainbow actions. Public pages keep their existing page layouts.

**Tech stack:** Next.js 16, React 19, TypeScript, Tailwind 4, existing SVG icons and Recharts.

## Tasks

- [x] Add and run behavioral regression tests for primary navigation, secondary route access, More state, route highlighting, hidden public chrome, and appearance restoration. Tests use the existing Node/TypeScript component harness pattern.
- [x] Update `web/src/components/TabBar.tsx` to Home, Binders, Scan, Lookup, More. Preserve scan queue badges and lookup detail-route selection. More uses a native modal dialog, closes on navigation and Escape, traps focus through native dialog behavior, and restores scrolling/focus on close.
- [x] Add `web/src/components/AppHeader.tsx`; place it in the existing root layout. Change `TcgPicker.tsx` into an inline labeled trigger while retaining its saved game preference and accessible choice sheet.
- [x] Update `web/src/app/page.tsx`, `globals.css`, and `rainbow.css`: graphite defaults, three text roles, static pastel rainbow actions, neutral two-column stats, compact real-value context, 11–12px supporting labels, sentence-case headings, regular spacing, and a quieter chart. Preserve alerts, collection progress, movers, top cards, gains/losses, all quick actions, and Hide prices protections. Add Graphite to appearance settings so the approved surface can be restored without losing saved Pure Black, Midnight, or Light choices.
- [x] Run the new regression tests, existing interface/data tests, TypeScript, and lint on changed components. Update existing browser navigation expectations to the approved More grouping.
- [x] Build a local fixture from the real client components and compiled app CSS, with deterministic API responses and no live database access. Use browser inspection to check the 390px and 320px layouts, game selection, More dismissal/navigation, chart ranges, and Hide prices. Save a screenshot of the implemented app UI.

## Scope

No auth changes, schema changes, new dependencies, collection writes, or changes to scanning/grading calculations. Preserve appearance preferences (including true black, midnight, and light) and use the existing Geist font. The selected preview is a design reference, not a replacement for live data or existing functionality. The user approved creating and merging a PR after reviewing the before/after comparison.

## Verification results

- Integrated onto current `origin/master`, retaining onboarding, price alerts, lazy chart loading, and scanner preparation.
- `node --test tests/*.test.cjs`: 199 passed, 0 failed, 3 optional browser suites skipped because their browser modules are not installed.
- ESLint on the changed React components, layout, dashboard, settings, and new test: passed.
- Full `npm run typecheck`: passed.
- Production Turbopack build: passed with a temporary local root setting to accommodate the worktree's linked dependencies. The application configuration was restored unchanged afterward.
- Independent integration review: no actionable findings.
- Real component bundle and Tailwind/PostCSS stylesheet compiled successfully in the isolated localhost fixture.
- Browser checks: no horizontal overflow at 320px and 390px; navigation targets exceed 44px; game choice persists across routes; More's routes, Escape dismissal, focus return, and scrolling restoration work; range selection requests the selected range; no JavaScript console errors observed.
- Hide prices removes displayed values and signs and renders a neutral flat chart. Dark and light appearances checked.
- Local fixture and screenshots are stored in the chat's visualization directory, outside the application source. No live database was used for UI verification.
