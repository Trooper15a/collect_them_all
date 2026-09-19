# Security scan and local remediation — 2026-09-19

The repository scan found 15 issues: 5 high, 9 medium, and 1 low. Local patches address their identified paths. Nothing was deployed, pushed, or changed in the production database. Existing user changes were preserved.

Overall fix verification outcome: **blocked for complete release verification**. Focused tests, application type checks, targeted lint, and a real PostgreSQL migration test passed. The full repository type check fails on a pre-existing missing `better-sqlite3` dependency in `web/scripts/migrate-to-postgres.ts:12`. A credentialed production build and deployment, real-browser multi-account lifecycle testing, and production configuration verification were not performed. Do not interpret the local patch as confirmation that production is protected.

## Boundaries and patches

The central invariant is that an authenticated user may read or mutate only their own collection, openings, alerts, and preferences. Public catalog data remains public. Shared maintenance and card-mapping changes require the existing administrator identity.

| Finding | Local changes |
|---|---|
| Foreign item updates, deletes, transfers (high) | `web/src/lib/ownership.ts` provides SQL ownership subqueries; item routes constrain source mutations and destination portfolios. |
| Global CSV export (high) | Export requires authentication and passes the current owner to valuation; private responses are not cached. Spreadsheet formula prefixes are neutralized. |
| Foreign opening reads/deletes and children (high) | Opening routes check owner; child deletion also checks the parent ID from the URL. |
| Global alerts and same-card collisions (medium) | Alert helpers/routes filter by owner; schema and migration use `(user_id, card_id)` uniqueness. |
| Public set ownership disclosures (medium) | Anonymous set responses contain no private ownership totals; signed-in totals use owned portfolios, including alternate-number matching. |
| Global dashboard history and deck comparison (medium) | History joins owned portfolios instead of exposing global snapshots; deck comparisons use owned holdings. |
| Global cleanup by ordinary users (high) | Shared administrator guard runs before destructive work. |
| Public/global maintenance jobs (high) | TCG import, scan rebuild, and index updates require administrator access; rebuild calls share one in-process execution. |
| Public card-link poisoning (medium) | Resolve POST requires administrator access; public resolution reads remain available. |
| Shared preference keys (low) | New `user-settings.ts` namespaces preferences by authenticated user; operational cache settings remain global. |
| Automatic orphan-data claiming (medium) | Login no longer assigns legacy records to the next user; import only reuses portfolios owned by its caller. |
| Private offline cache and cross-account queued writes (medium) | Worker caches public assets only, removes old private caches and the unowned queue during activation, and never replays mutations. API responses use private/no-store headers. Logout clears guest queue state. UI/FAQ/landing copy reflects the new behavior. |
| Coolify bearer sent over HTTP (medium) | CI requires a configured HTTPS endpoint and rejects failed deployment requests. |
| Published PostgreSQL port and fallback password (medium) | Compose removes host database port exposure and requires an explicit password. |
| Anonymous card reads launch archive backfills (medium) | Public card reads no longer start expensive archive jobs. Existing history remains readable. |

Other directly related files include `web/src/lib/{alerts,auth,cards,decks,import,portfolio,scan-rebuild}.ts`, the affected `web/src/app/api/` routes, `web/src/db/schema.ts`, `web/next.config.ts`, `web/public/sw.js`, PWA/status/logout components, `.github/workflows/build-and-deploy.yml`, `docker-compose.yml`, and `web/Dockerfile`. The Docker model token now uses a BuildKit secret instead of a build argument.

The patch keeps the current database/query/authentication design. Ownership conditions at the query/mutation boundary cover guessed IDs without changing the data model. No legacy ownership is guessed. The intentionally unowned offline mutation queue cannot safely be replayed as another account, so it is discarded.

## Validation

1. Syntax and integration checks:
   - `git diff --check`: pass.
   - From `web`: `node --check public/sw.js`: pass.
   - `node node_modules/typescript/bin/tsc --noEmit --incremental false`: fails only on the pre-existing missing `better-sqlite3` module in the legacy migration script, both before and after patches.
   - TypeScript compiler API using the same project configuration, excluding only `scripts/migrate-to-postgres.ts`: pass, zero diagnostics.
   - Targeted ESLint covering changed server helpers, API routes, landing/FAQ, Next config and changed components: pass, zero errors; four existing unused-variable/image warnings across those invocations.
   - `docker compose config --quiet` with a dummy validation password: pass. Unconfigured optional/auth variables and sandbox Docker-config access emitted warnings; no production values were read.
2. Security reproductions and alternate inputs:
   - `node --test tests/security.test.cjs`: all 13 tests pass. Initial item/opening tests failed against the original implementation and pass after patching.
   - Real handlers/helpers run with isolated owner fixtures and mocked database/authentication dependencies. Foreign owners, anonymous callers, mismatched parent IDs, shared card IDs, foreign snapshots and unowned records are covered. This is not a full PostgreSQL integration test of every route.
   - Service-worker tests prove no interception of private APIs, navigation or mutations; legacy caches/queue are purged and a legacy sync request sends no network writes.
3. Legitimate controls and migration:
   - Same suite preserves own-account item/opening operations, separate alerts for the same card, per-user settings, public catalog/history reads, administrator maintenance, and public asset caching.
   - `web/tests/security-migration.sql` ran against a disposable `postgres:16-alpine` container with no network, ports or production volumes. It applied `web/scripts/security-migration.sql` twice, preserved existing and ownerless records, allowed two owners to alert on the same card, and verified owner-specific upserts. Pass; the container was removed afterward.
   - Fresh read-only patch review found one cache regression: stable model URLs would stop receiving updates. Restored public-model stale-while-revalidate and extended the worker test to prove a cached model is refreshed. No concrete surviving owner/admin bypass was reported. One review cycle completed.

Tests added: `web/tests/security.test.cjs` and `web/tests/security-migration.sql`. No production exploitation tests, account creation, purchases, private browsing, database migration, or deployment were performed.

## Required before rollout — not executed

1. Back up the intended database and apply `web/scripts/security-migration.sql` **before** starting the patched app. The new alert conflict target requires that index. Test the complete release against a staging copy first.
2. Configure repository variable `COOLIFY_BASE_URL` to the verified HTTPS origin of your Coolify instance. Rotate the previously HTTP-transmitted `COOLIFY_TOKEN`; assess historical exposure of `MODEL_TOKEN` from older build arguments. The workflow fails closed without HTTPS.
3. Set `POSTGRES_PASSWORD` to the database's actual strong password. Changing this environment variable does not change an existing PostgreSQL volume's password. Use URL-safe characters or correctly encode credentials in connection URLs. The DB is reachable only inside the Compose network by default.
4. For a local Docker build, supply the model-download secret through BuildKit, for example `docker build --secret id=github_token,env=GITHUB_TOKEN -f web/Dockerfile web`, with `GITHUB_TOKEN` already set privately in the environment. CI uses its existing `MODEL_TOKEN` secret.
5. Any legitimate legacy records with a null owner need an explicit, reviewed owner assignment. They are no longer automatically claimed at sign-in. Existing global preference values are not copied to all users; each account starts with defaults until saving preferences.
6. Existing unowned offline queued changes are discarded on worker upgrade; they cannot be safely attributed. Private collection access and changes require internet. Verify worker upgrade, logout, and account switching in real browsers before rollout, including existing open tabs.
7. Resolve the legacy-script typecheck dependency and run the complete intended build/release checks. Confirm the shared administrator allowlist is appropriate for deployment; this patch retains the existing administrator identity.

## Scan scope and artifacts

Scan ID: `198d2b3d-41f2-49e1-9b18-3ad5e2cbd266`.

The completed scan records the pre-fix snapshot. Its findings are not rewritten or marked closed by these local edits. The detailed bundle is stored in the scanning workstation's temporary Codex Security artifact directory and is intentionally not committed because it contains machine-specific paths and a pre-fix repository snapshot. Its `report.md`, `findings.json`, and `coverage.json` contain the finding evidence and exclusions. Review covered 194 first-party source/configuration/documentation files. Vendored dependencies, generated artifacts, binary model/data/image assets, ignored credentials, and historical Git contents were excluded. This was not a current dependency-advisory clearance.

The public production landing page was viewed without signing in or invoking application actions. It advertised full offline use; local copy now reflects the safer implementation. This observation does not establish what code/configuration production currently runs or whether any issue was exploited.

Plugin-reported measured scan usage: 17,313,941 total tokens (17,259,928 input, including 16,628,224 cached; 54,013 output). This is the plugin's four-thread scan accounting, not a cost estimate or a measurement of the entire remediation turn.
