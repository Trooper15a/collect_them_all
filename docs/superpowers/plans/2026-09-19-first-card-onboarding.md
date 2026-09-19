# First-card Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a new signed-in collector a skippable three-step flow that chooses a game, adds a real first card, and introduces binders, followed by a quiet five-card milestone.

**Architecture:** A user-scoped onboarding service and authenticated route expose eligibility and bounded preference updates. A client gate redirects eligible users to `/onboarding`; the wizard composes shared card-discovery UI, the existing scanner, and the existing add-to-portfolio sheet. Dashboard milestone UI derives from the existing dashboard item count and persists only dismissals in the existing user settings table.

**Tech Stack:** Next.js 16 App Router, React 19, Auth.js, Drizzle ORM/PostgreSQL, Zod, Tailwind CSS, Node test runner, TypeScript, ESLint.

---

## File map

**Create**

- `web/src/lib/onboarding.ts` — authenticated-user onboarding state, item count, eligibility, and bounded preference writes.
- `web/src/app/api/onboarding/route.ts` — GET/PATCH transport for the onboarding service.
- `web/src/components/OnboardingGate.tsx` — session-aware protected-route redirect and neutral loading state.
- `web/src/components/CardDiscovery.tsx` — reusable search, language filter, camera match picker, and add-card selection UI.
- `web/src/app/onboarding/page.tsx` — three-step wizard and success state.
- `web/src/components/FirstBinderMilestone.tsx` — non-blocking dashboard progress/discovery card.
- `web/tests/onboarding.test.cjs` — state-decision and route-boundary regression tests.

**Modify**

- `web/src/app/layout.tsx` — wrap the app shell with `OnboardingGate`.
- `web/src/middleware.ts` — protect `/onboarding`.
- `web/src/components/TabBar.tsx` — hide navigation on `/onboarding`.
- `web/src/components/TcgPicker.tsx` — hide the floating picker on `/onboarding`.
- `web/src/components/PwaRegister.tsx` — suppress install promotion during onboarding.
- `web/src/components/AddToPortfolioSheet.tsx` — return the added item and binder through `onAdded`.
- `web/src/app/scan/page.tsx` — render shared `CardDiscovery` for ordinary single-card discovery while retaining guest, bulk, and stand-mode behavior.
- `web/src/app/page.tsx` — render the five-card milestone from existing dashboard counts.
- `web/src/app/settings/page.tsx` — add “Restart introduction.”
- `web/src/app/api/settings/route.ts` — no onboarding fields; the dedicated onboarding route owns them.

## Task 1: Onboarding decisions and account-scoped service

**Files:**
- Create: `web/src/lib/onboarding.ts`
- Create: `web/tests/onboarding.test.cjs`
- Modify: `web/tests/security.test.cjs`

- [ ] **Step 1: Write failing pure decision tests**

Create `web/tests/onboarding.test.cjs` with a small TypeScript loader matching the existing security-test compiler setup, then test the exported decision function:

```js
test('onboarding eligibility is limited to pending collectors with no items', () => {
  const { shouldStartOnboarding } = load('src/lib/onboarding.ts', {
    '@/db': { db: {}, schema: {} },
    '@/lib/user-settings': {},
  });
  assert.equal(shouldStartOnboarding('pending', 0), true);
  assert.equal(shouldStartOnboarding('dismissed', 0), false);
  assert.equal(shouldStartOnboarding('completed', 0), false);
  assert.equal(shouldStartOnboarding('pending', 1), false);
});
```

Also add a security harness test that Alice and Bob receive different `onboardingState` values through the existing user-scoped setting helpers.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `cd web && node --test tests/onboarding.test.cjs tests/security.test.cjs`

Expected: FAIL because `src/lib/onboarding.ts` and `shouldStartOnboarding` do not exist.

- [ ] **Step 3: Implement the service**

Create `web/src/lib/onboarding.ts` with these public contracts:

```ts
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getUserSetting, setUserSetting } from '@/lib/user-settings';

export type OnboardingState = 'pending' | 'dismissed' | 'completed';
export type MilestoneState = 'active' | 'dismissed' | 'opened';

export interface OnboardingStatus {
  state: OnboardingState;
  milestoneState: MilestoneState;
  itemCount: number;
  eligible: boolean;
}

export function shouldStartOnboarding(state: OnboardingState, itemCount: number) {
  return state === 'pending' && itemCount === 0;
}

export async function getOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  const [state, milestoneState, rows] = await Promise.all([
    getUserSetting('onboardingState', 'pending') as Promise<OnboardingState>,
    getUserSetting('firstBinderMilestone', 'active') as Promise<MilestoneState>,
    db.select({ n: sql<number>`count(*)::int` })
      .from(schema.portfolioItems)
      .innerJoin(schema.portfolios, eq(schema.portfolioItems.portfolioId, schema.portfolios.id))
      .where(eq(schema.portfolios.userId, userId)),
  ]);
  const itemCount = rows[0]?.n ?? 0;
  return { state, milestoneState, itemCount, eligible: shouldStartOnboarding(state, itemCount) };
}

export async function setOnboardingState(state: OnboardingState) {
  await setUserSetting('onboardingState', state);
}

export async function setMilestoneState(state: MilestoneState) {
  await setUserSetting('firstBinderMilestone', state);
}
```

Validate stored strings before returning them so malformed legacy values fall back to `pending` or `active`.

- [ ] **Step 4: Run the focused tests**

Run: `cd web && node --test tests/onboarding.test.cjs tests/security.test.cjs`

Expected: all tests PASS, including the account-isolation assertion.

- [ ] **Step 5: Commit the service**

```bash
git add web/src/lib/onboarding.ts web/tests/onboarding.test.cjs web/tests/security.test.cjs
git commit -m "feat: add account-scoped onboarding state"
```

## Task 2: Authenticated onboarding API

**Files:**
- Create: `web/src/app/api/onboarding/route.ts`
- Modify: `web/tests/onboarding.test.cjs`

- [ ] **Step 1: Add failing route tests**

Cover these exact cases with a stubbed `requireUserId` and onboarding service:

```js
test('onboarding API rejects anonymous reads and writes', async () => {
  assert.equal((await anonymous.GET()).status, 401);
  assert.equal((await anonymous.PATCH(request({ state: 'dismissed' }))).status, 401);
});

test('onboarding API returns current account status and accepts bounded patches', async () => {
  assert.deepEqual(await (await alice.GET()).json(), {
    state: 'pending', milestoneState: 'active', itemCount: 0, eligible: true,
  });
  assert.equal((await alice.PATCH(request({ state: 'dismissed' }))).status, 200);
  assert.equal((await alice.PATCH(request({ state: 'invalid' }))).status, 400);
  assert.equal((await alice.PATCH(request({ milestoneState: 'opened' }))).status, 200);
});
```

- [ ] **Step 2: Run the route tests and confirm failure**

Run: `cd web && node --test tests/onboarding.test.cjs`

Expected: FAIL because `/api/onboarding` does not exist.

- [ ] **Step 3: Implement GET and PATCH**

Use Zod and permit exactly one or both bounded fields:

```ts
const Patch = z.object({
  state: z.enum(['pending', 'dismissed', 'completed']).optional(),
  milestoneState: z.enum(['active', 'dismissed', 'opened']).optional(),
}).refine((value) => value.state !== undefined || value.milestoneState !== undefined);
```

Both handlers call `requireUserId` before reading the body or service. GET returns `getOnboardingStatus(userId)`. PATCH applies supplied values, then returns the refreshed status. Use 401 for missing auth, 400 for validation, and 500 with a generic error string for unexpected failures.

- [ ] **Step 4: Run tests and typecheck**

Run: `cd web && node --test tests/onboarding.test.cjs && npm run typecheck`

Expected: route tests PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the API**

```bash
git add web/src/app/api/onboarding/route.ts web/tests/onboarding.test.cjs
git commit -m "feat: expose onboarding eligibility API"
```

## Task 3: Gate protected routes and hide the normal shell

**Files:**
- Create: `web/src/components/OnboardingGate.tsx`
- Modify: `web/src/app/layout.tsx`
- Modify: `web/src/middleware.ts`
- Modify: `web/src/components/TabBar.tsx`
- Modify: `web/src/components/TcgPicker.tsx`
- Modify: `web/src/components/PwaRegister.tsx`
- Modify: `web/tests/onboarding.test.cjs`

- [ ] **Step 1: Add failing route-policy tests**

Add source-level boundary assertions only for configuration that cannot be mounted without a browser test dependency:

```js
test('onboarding is protected and hidden from the normal shell', () => {
  assert.match(readText('src/middleware.ts'), /"\/onboarding\/:path\*"/);
  for (const file of ['TabBar.tsx', 'TcgPicker.tsx', 'PwaRegister.tsx']) {
    assert.match(readText('src/components/' + file), /\/onboarding/);
  }
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd web && node --test tests/onboarding.test.cjs`

Expected: FAIL because the route is absent from the middleware and shell exclusions.

- [ ] **Step 3: Implement `OnboardingGate`**

The client component uses `useSession`, `usePathname`, and `useRouter`. Public paths and `/onboarding` render immediately. Authenticated protected paths fetch `/api/onboarding` with `cache: 'no-store'`; eligible users call `router.replace('/onboarding')`. During the first authenticated check, render a centered `role="status"` loader. On network failure, render children and expose a small “Check introduction” retry button rather than trapping the app.

Use a module-local public-path predicate shared only inside the component:

```ts
const BYPASS = ['/landing', '/login', '/privacy', '/terms', '/faq', '/auth/error', '/onboarding'];
const bypassesGate = (pathname: string) => BYPASS.some((p) => pathname === p || pathname.startsWith(p + '/'));
```

- [ ] **Step 4: Integrate the gate and shell exclusions**

Wrap the existing main content, tab bar, picker, toasts, and PWA registration inside `OnboardingGate`, keeping `AuthProvider` outermost. Add `"/onboarding/:path*"` to the middleware matcher. Add `/onboarding` to the hidden-path lists of the tab bar, game picker, and PWA registration.

- [ ] **Step 5: Run route tests, typecheck, and lint changed files**

Run: `cd web && node --test tests/onboarding.test.cjs && npm run typecheck && npx eslint src/components/OnboardingGate.tsx src/app/layout.tsx src/middleware.ts src/components/TabBar.tsx src/components/TcgPicker.tsx src/components/PwaRegister.tsx`

Expected: tests PASS, typecheck exits 0, and ESLint reports no errors.

- [ ] **Step 6: Commit the gate**

```bash
git add web/src/components/OnboardingGate.tsx web/src/app/layout.tsx web/src/middleware.ts web/src/components/TabBar.tsx web/src/components/TcgPicker.tsx web/src/components/PwaRegister.tsx web/tests/onboarding.test.cjs
git commit -m "feat: route new collectors into onboarding"
```

## Task 4: Return add-card results from the existing sheet

**Files:**
- Modify: `web/src/components/AddToPortfolioSheet.tsx`
- Modify: `web/src/app/scan/page.tsx`
- Modify: `web/src/app/sets/[id]/page.tsx`
- Modify: `web/tests/onboarding.test.cjs`

- [ ] **Step 1: Add a failing contract assertion**

Assert the component exports this result type and callback:

```ts
export interface AddedPortfolioItem {
  itemId: number;
  portfolioId: number;
  portfolioName: string;
  card: AddSheetCard;
}

onAdded?: (result: AddedPortfolioItem) => void;
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd web && node --test tests/onboarding.test.cjs`

Expected: FAIL because `onAdded` currently returns no result.

- [ ] **Step 3: Implement the result callback**

Track the selected/created binder name. Parse the successful item response and call:

```ts
const item = await r.json();
onAdded?.({
  itemId: item.id,
  portfolioId: Number(pid),
  portfolioName: selectedPortfolioName,
  card,
});
```

Keep the existing success state and delayed close. Existing scan and set callers accept an unused callback argument, preserving their behavior.

- [ ] **Step 4: Run tests, typecheck, and focused lint**

Run: `cd web && node --test tests/onboarding.test.cjs && npm run typecheck && npx eslint src/components/AddToPortfolioSheet.tsx src/app/scan/page.tsx 'src/app/sets/[id]/page.tsx'`

Expected: PASS with no lint errors.

- [ ] **Step 5: Commit the callback**

```bash
git add web/src/components/AddToPortfolioSheet.tsx web/src/app/scan/page.tsx 'web/src/app/sets/[id]/page.tsx' web/tests/onboarding.test.cjs
git commit -m "refactor: report added card destination"
```

## Task 5: Extract reusable card discovery

**Files:**
- Create: `web/src/components/CardDiscovery.tsx`
- Modify: `web/src/app/scan/page.tsx`
- Modify: `web/tests/onboarding.test.cjs`

- [ ] **Step 1: Add failing pure search-state tests**

Export and test a small result normalizer/sorter used by the component so behavior remains stable during extraction:

```js
test('card discovery keeps relevance order and supports price sorting', () => {
  const cards = [{ id: 'a', display: { amount: 2 } }, { id: 'b', display: { amount: 5 } }];
  assert.deepEqual(Array.from(sortDiscoveryResults(cards, 'relevance'), x => x.id), ['a', 'b']);
  assert.deepEqual(Array.from(sortDiscoveryResults(cards, 'price-desc'), x => x.id), ['b', 'a']);
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `cd web && node --test tests/onboarding.test.cjs`

Expected: FAIL because `CardDiscovery` and its sorter do not exist.

- [ ] **Step 3: Build the focused component**

Define the public interface:

```ts
export interface CardDiscoveryProps {
  initialTcg?: ActiveTcg;
  compact?: boolean;
  allowCamera?: boolean;
  onSelect(card: AddSheetCard & { imageUrl?: string | null }): void;
}
```

Move ordinary debounced search, abort handling, language selection, sorting, result cards, scanner opening, and match resolution from `/scan` into this component. Preserve the current endpoints and query parameters. It owns no binder writes and does not import onboarding code.

The compact variant hides bulk/stand/recent-scan sections and labels the result action “Add.” The normal scanner page keeps guest queue, bulk queue, stand mode, recent scans, and `AddToPortfolioSheet`; it supplies `onSelect={setAdding}` to shared discovery.

- [ ] **Step 4: Run tests and compare scanner behavior**

Run: `cd web && node --test tests/onboarding.test.cjs && npm run typecheck && npx eslint src/components/CardDiscovery.tsx src/app/scan/page.tsx`

Expected: PASS, zero TypeScript errors, and zero ESLint errors.

Manual check: `/scan` still returns Pikachu results, opens the camera matcher, queues guest cards, and opens the existing add sheet for authenticated users.

- [ ] **Step 5: Commit the extraction**

```bash
git add web/src/components/CardDiscovery.tsx web/src/app/scan/page.tsx web/tests/onboarding.test.cjs
git commit -m "refactor: share card discovery UI"
```

## Task 6: Build the three-step wizard

**Files:**
- Create: `web/src/app/onboarding/page.tsx`
- Modify: `web/tests/onboarding.test.cjs`

- [ ] **Step 1: Add failing wizard-boundary assertions**

Assert the page contains accessible step titles, uses shared discovery and add sheet, and exposes skip/retry actions:

```js
test('wizard composes shared discovery and add flow', () => {
  const source = readText('src/app/onboarding/page.tsx');
  assert.match(source, /CardDiscovery/);
  assert.match(source, /AddToPortfolioSheet/);
  assert.match(source, /Skip for now/);
  assert.match(source, /Choose your game/);
  assert.match(source, /Add your first card/);
  assert.match(source, /View my binder/);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd web && node --test tests/onboarding.test.cjs`

Expected: FAIL because the onboarding page does not exist.

- [ ] **Step 3: Implement wizard state and step 1**

Use a discriminated state:

```ts
type WizardState =
  | { step: 'game'; tcg: ActiveTcg }
  | { step: 'card'; tcg: ActiveTcg; adding: DiscoveryCard | null }
  | { step: 'success'; added: AddedPortfolioItem };
```

Default to Pokémon. Render all supported games plus All Games. Continue calls `setActiveTcg(tcg)` and advances to card discovery. Every pre-success step includes “Skip for now,” which PATCHes `{ state: 'dismissed' }` and routes to `/`.

- [ ] **Step 4: Implement card discovery and success**

Render compact `CardDiscovery` with the selected game. Selection opens `AddToPortfolioSheet`. Its result callback PATCHes `{ state: 'completed' }` and advances to success even if that PATCH fails, because the owned item prevents future eligibility. The success view shows the actual card, binder name, best available market value, `/portfolios/{portfolioId}`, and `/scan` actions.

Move focus to each step heading, expose `aria-current="step"`, announce async failures with `role="alert"`, preserve the selected card on add failure, and support Back from card to game. Use reduced-motion-safe existing animation classes.

- [ ] **Step 5: Run tests, typecheck, and lint**

Run: `cd web && node --test tests/onboarding.test.cjs && npm run typecheck && npx eslint src/app/onboarding/page.tsx`

Expected: PASS with no TypeScript or lint errors.

- [ ] **Step 6: Commit the wizard**

```bash
git add web/src/app/onboarding/page.tsx web/tests/onboarding.test.cjs
git commit -m "feat: add first-card onboarding wizard"
```

## Task 7: Add the five-card milestone and restart control

**Files:**
- Create: `web/src/components/FirstBinderMilestone.tsx`
- Modify: `web/src/app/page.tsx`
- Modify: `web/src/app/settings/page.tsx`
- Modify: `web/tests/onboarding.test.cjs`

- [ ] **Step 1: Add failing milestone-decision tests**

Export a pure presentation decision:

```ts
export type MilestoneView = 'progress' | 'sets' | null;
export function milestoneView(itemCount: number, state: MilestoneState): MilestoneView {
  if (state !== 'active') return null;
  if (itemCount >= 1 && itemCount <= 4) return 'progress';
  if (itemCount >= 5) return 'sets';
  return null;
}
```

Test 0, 1, 4, 5, dismissed, and opened states.

- [ ] **Step 2: Run tests and confirm failure**

Run: `cd web && node --test tests/onboarding.test.cjs`

Expected: FAIL because the milestone component and decision do not exist.

- [ ] **Step 3: Implement the dashboard milestone**

`FirstBinderMilestone` receives `itemCount`, fetches `/api/onboarding`, and renders:

- counts 1–4: “Build your first binder — N of 5 cards,” a five-segment progress bar, and a `/scan` action;
- count 5 or greater while active: “Your binder is taking shape” and a `/sets` action;
- a dismiss control that PATCHes `{ milestoneState: 'dismissed' }`;
- opening Sets first PATCHes `{ milestoneState: 'opened' }`.

Render it on the dashboard after the summary widgets. Do not render it for an empty collection or after dismissal/opening.

- [ ] **Step 4: Implement Settings restart**

Add an “Introduction” row in Account settings. Its button PATCHes `{ state: 'pending', milestoneState: 'active' }`, then navigates to `/onboarding`. It must work for existing users when explicitly requested; direct `/onboarding` access therefore renders even if GET says ineligible, while the automatic gate continues to require zero items.

- [ ] **Step 5: Run tests, typecheck, and focused lint**

Run: `cd web && node --test tests/onboarding.test.cjs && npm run typecheck && npx eslint src/components/FirstBinderMilestone.tsx src/app/page.tsx src/app/settings/page.tsx`

Expected: PASS with no errors.

- [ ] **Step 6: Commit milestone and restart**

```bash
git add web/src/components/FirstBinderMilestone.tsx web/src/app/page.tsx web/src/app/settings/page.tsx web/tests/onboarding.test.cjs
git commit -m "feat: guide collectors to five cards"
```

## Task 8: Full validation and documentation

**Files:**
- Modify only if validation exposes defects in files from Tasks 1–7.

- [ ] **Step 1: Run all onboarding and security tests**

Run: `cd web && node --test tests/onboarding.test.cjs tests/security.test.cjs`

Expected: all tests PASS.

- [ ] **Step 2: Run the application checks**

Run: `cd web && npm run typecheck && npm run lint && npm run build`

Expected: typecheck, ESLint, and production build exit 0. Existing unrelated warnings must be recorded; new warnings in changed files must be fixed.

- [ ] **Step 3: Perform an isolated database smoke test**

Against a disposable PostgreSQL database, create Alice and Bob. Give Bob one portfolio item and different onboarding settings. Verify Alice is eligible, Bob is not, and neither account reads the other's state. No production database is used.

- [ ] **Step 4: Perform browser smoke tests**

Use a new test account and verify:

1. first protected route redirects to `/onboarding` without dashboard flash;
2. Skip exits and does not reappear;
3. Settings restart reopens the wizard;
4. Pokémon is selected by default and changes propagate to discovery;
5. manual search returns results and camera denial leaves search usable;
6. adding a card creates “My Collection,” preserves form values on a simulated failure, and shows the real binder success state;
7. normal `/scan` guest, authenticated, bulk, and stand-mode flows still work;
8. the progress card displays at one through four cards, the Sets discovery card appears at five, and dismissal persists;
9. keyboard focus, accessible labels, browser Back, mobile layout, and reduced motion behave as specified.

- [ ] **Step 5: Review the final diff for scope and secrets**

Run: `git diff cbaf031...HEAD --check && git diff cbaf031...HEAD --stat && git status --short`

Expected: only onboarding, shared discovery, tests, and approved documentation are changed; no credentials, environment files, generated build output, or unrelated user files appear.

- [ ] **Step 6: Commit validation fixes if needed**

If Step 1–5 required code changes:

```bash
git add <only-the-onboarding-files-fixed-during-validation>
git commit -m "fix: resolve onboarding validation issues"
```

If no changes were required, do not create an empty commit.
