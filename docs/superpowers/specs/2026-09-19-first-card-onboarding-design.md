# First-card onboarding design

## Goal

Help a newly authenticated collector reach RipnPull's core value in under two minutes: choose a game, find one real card, add it to a binder, and see its tracked value. The flow must be skippable, mobile-first, accessible, and built on the existing search, scanner, binder, and add-card behavior.

## Chosen approach

Use an action-first, full-screen wizard. Preference-heavy setup and a standalone task checklist were rejected because they delay the first useful result or feel like extra work. The wizard asks only for a game and a card. Currency, condition, language, and binder customization remain in their existing settings and add-card controls.

## Eligibility and entry

- Show onboarding only to an authenticated user who owns zero portfolio items and whose user-scoped `onboardingState` setting is neither `dismissed` nor `completed`.
- A client-side `OnboardingGate` checks eligibility once the Auth.js session resolves on protected app routes. While checking, it renders a neutral loading state so the empty dashboard does not flash first.
- Eligible users are redirected to `/onboarding`. Public pages, authentication pages, and `/onboarding` bypass the gate.
- Existing users with at least one portfolio item never see the wizard, even when no onboarding preference exists.
- “Skip for now” records `dismissed` and routes to the dashboard. Settings exposes “Restart introduction,” which resets the state to `pending` and opens `/onboarding`.
- Successfully adding the first card records `completed`. Item ownership remains the authoritative fallback, so a failed preference write cannot trap a user in onboarding.

The state uses the existing user-scoped settings storage. No new database table or migration is required.

## User flow

### Step 1: Choose a game

Show the supported games as large tap targets with Pokémon selected by default. Continuing calls the existing `setActiveTcg` preference helper so the scanner, search, and sets catalog inherit the choice. “All games” is available but is not the default because a focused search produces clearer results.

### Step 2: Add the first card

Search is the primary action and camera scan is secondary. The screen includes:

- a card-name, number, or set-code search field;
- English and Japanese language controls;
- compact result cards showing image, name, set, number, language, and current price;
- a camera button using the existing scanner and match-resolution interface;
- empty, loading, no-results, and retry states.

Selecting “Add” opens the existing add-to-portfolio sheet. If the user has no binder, the sheet's current automatic binder-creation behavior creates “My Collection.” Condition, quantity, price variant, and cost basis remain editable in that sheet; the wizard does not invent a second add-card form.

The search and result UI should be extracted into focused reusable components or hooks shared with `/scan`, rather than copied from the large scanner page. Camera matching continues to use the existing `Scanner` component.

### Step 3: Show the result

After the add request succeeds, show a short success state containing:

- the selected card image and name;
- the binder it was added to;
- the tracked market value when available;
- a primary “View my binder” action;
- a secondary “Add another card” action.

Completing this screen records `onboardingState=completed`. “View my binder” opens the created or selected binder. “Add another card” opens the normal scanner so the user learns the permanent location of the workflow.

## Five-card milestone

For users with one to four owned cards, the dashboard shows one compact, dismissible progress card: “Build your first binder — N of 5 cards.” Its action opens `/scan`. It never blocks navigation and disappears automatically at five cards.

When the fifth card is added, show one celebratory toast and replace the progress card with a single-use discovery card linking to Sets: “See how close you are to completing a set.” After that card is opened or dismissed, onboarding UI is finished. Dismissal uses another user-scoped setting so it follows the account across devices.

## Components and boundaries

- `OnboardingGate`: resolves session and eligibility, prevents page flashing, and redirects. It does not contain wizard UI.
- `/onboarding`: owns the three-step state machine and navigation.
- `/api/onboarding`: authenticated GET/PATCH endpoint for eligibility and bounded state changes. GET returns `state`, `itemCount`, and `eligible`; PATCH accepts only the documented onboarding states and milestone dismissal fields.
- Shared card discovery module: owns debounced search, abort handling, language/game filters, loading/error states, and result rendering for both onboarding and `/scan`.
- Existing `Scanner`: performs camera capture and matching without onboarding-specific branches.
- Existing `AddToPortfolioSheet`: performs binder selection/creation and the authenticated item write. It reports the created item and binder to the caller so the wizard can render its success state.
- `FirstBinderMilestone`: dashboard-only presentation derived from the authenticated item count and user-scoped dismissal state.

Each unit has one responsibility. Onboarding coordinates existing capabilities but does not duplicate card matching, pricing, binder ownership checks, or item creation.

## Data and security

- Every onboarding API request requires `requireUserId`.
- Item counts join portfolio items through portfolios owned by the authenticated user.
- Onboarding settings use the existing encoded per-user settings key helper.
- Card and binder mutations continue through the existing ownership-checked APIs.
- The client never supplies a user ID and cannot mark another account's onboarding state.
- No private collection response is added to service-worker caches.

## Failure and recovery

- Eligibility failure shows the normal app with a non-blocking retry path; it must not create a redirect loop.
- Search failures keep the query and offer Retry.
- Camera permission denial keeps manual search available.
- Add failures keep the selected card and form values so the user can retry.
- A successful add followed by a failed state PATCH still exits onboarding because the next eligibility check sees an owned item.
- The browser Back button moves to the previous wizard step. Back from step 1 exits to the dashboard without recording dismissal; the gate may offer onboarding again on the next protected navigation.
- Refreshing resumes safely from step 1 unless the first card already exists, in which case the user proceeds to the normal app.

## Accessibility and presentation

- Use the existing dark theme, card surfaces, rainbow primary action, typography, and spacing tokens.
- Keep the wizard within the app's current `max-w-3xl` responsive width while hiding the tab bar and floating game picker on `/onboarding`.
- Provide a visible step label, descriptive page title, programmatic focus on each new step, keyboard-accessible choices, and live announcements for search/add status.
- Respect reduced-motion preferences. Celebration is a restrained toast and scale/fade treatment, with no mandatory animation.
- “Skip for now” remains visible on every pre-completion step.

## Validation

Automated coverage should verify:

- eligibility for new, dismissed, completed, and existing collectors;
- account isolation in the onboarding status and item-count API;
- gate behavior without redirect loops or public-route interception;
- search retry, no-results, camera-denied fallback, and add failure recovery;
- successful first-card addition, automatic binder creation, completion state, and destination links;
- milestone visibility for counts 1–4, fifth-card transition, and permanent dismissal;
- keyboard navigation and accessible names for steps and actions.

Manual production smoke testing should use a new test account and confirm the complete search path, camera-permission fallback, skip/restart behavior, first binder creation, five-card milestone, and normal navigation after completion.

## Out of scope

- Collecting detailed preferences before the first card.
- Sample or fake cards.
- Mandatory tutorials, coach marks across every page, rewards, badges, email campaigns, or analytics infrastructure.
- Changes to pricing imports, scanner models, authentication providers, or binder valuation rules.
