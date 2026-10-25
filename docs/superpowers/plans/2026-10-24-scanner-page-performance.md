# Scanner and page performance implementation plan

> **For agentic workers:** Use subagent-driven-development task by task. Only one implementation subagent at once; root owns separate website changes.

**Goal:** Reduce the first-scan wait and slow sets/chart loading without changing card recognition, confirmation, valuations, or ownership isolation.

**Architecture:** Prepare the existing ONNX model and server index on scan intent and in idle time on the Scan page, run an unreported blank inference to initialize kernels, and reuse that engine. Keep actual matching, thresholds, scene protection, and confirmation unchanged. Scope catalogue counts and serve previously cached public counts during one background refresh; never share private ownership data. Parallelize independent authenticated data reads and split the chart plotting library from the small chart wrapper.

**Tech Stack:** Next 16.3.4, React 19, TypeScript, ONNX Runtime, PostgreSQL/Drizzle, existing Node/VM regressions.

## Measured baseline (live, 2026-10-24)
- Sets (Pokemon/English): 11.416s first measured response; 0.348s next response.
- Search Pikachu: 3.045s then 0.644s.
- Health: 0.348s and 1.528s.
- Two matcher requests (512-dimensional diagnostic query): 0.913s and 0.618s. These do not isolate cold inference on a phone.
- Model: 18,652,390 bytes; WASM runtime: 13,961,845 bytes. Runtime HTTP cache max-age=0; model one week.
- Scanner model initialization currently starts with camera mount. Server catalogue count cache expires every 60s and counts all games/languages, even for a filtered request.
- Charts import Recharts eagerly, including pages with fewer than two history points. Card/binder/dashboard endpoints contain independent sequential reads.
- Server resource metrics are unavailable; no infrastructure changes are justified by measurements yet.

## 1. Prepare the scanner before first capture (implementation subagent)
- [x] Add failing behavior tests for preparation before camera, single engine/session across preparation/opening, blank inference never posting a match, and retry after preparation failure.
- [x] Add best-effort preparation entry point, idle Scan-page hook, and focus/pointer intent hooks on existing scan controls; no camera permission, match result, or new user step during preparation.
- [x] Warm the server's existing matching index through a validated GET on the matching route, sharing pending loads with POST. Preserve game/language filtering, ranking, duplicate protection, and timeout behavior.
- [x] Remove the successful-path model availability HEAD round trip; perform one serialized blank warmup before ready. Keep the model/backend/thresholds unchanged.
- Deferred: scanner runtime cache/version changes. The existing service worker already caches runtime assets; changing their unversioned URLs requires coordinated invalidation and is outside this measured warm-start fix.
- [x] Run scanner engine/route/component regression suites and lint owned files.

## 2. Reuse public catalogue work (root)
- [x] Add failing cold-concurrency, stale-refresh, bounded-age/error, game/language-scope, and private ownership isolation tests.
- [x] Introduce a bounded single-flight public catalogue cache with optional stale-while-revalidate and persistent fallback. Counts remain internal; API responses with ownership stay private/no-store.
- [x] Scope totals to requested game/language, parallelize list/count/owned reads after scope validation, and use a longer metadata freshness window with background refresh. Keep zero quantity, canonical numbers, coverage, and mixed-source correctness.
- [x] Retain strict/fresh behavior for other existing cached calls unless explicitly opted in.

## 3. Load card/chart data without waterfalls (root)
- [x] Test independent read scheduling with gated promises in real handlers; retain item/card/user checks and exact saved finish.
- [x] Parallelize history/FX/settings and binder/dashboard independent reads with rejection handling and unchanged response shapes.
- [x] Put Recharts in a lazily imported plot component, keeping empty/one-point states in the small wrapper, reserving plot height, and preserving hidden prices.
- [x] Verify chart bundle separation and client regressions. Record live baseline durations and local scheduling/bundle results; production after-change timings remain pending deployment.

## 4. Verify and publish
- [x] Independent spec and quality reviews; resolve concrete findings.
- [x] Full Node tests, route types/full TypeScript, changed-file lint, and normal production build.
- [x] Mobile browser checks with synthetic frames/data and real model when available; distinguish measured server speed from unmeasured phone speed.
- [x] Commit/push reviewed changes against latest master. Preserve original dirty checkout and all payment behavior.

## Verification results
- All 145 Node regression tests pass. Type generation and full TypeScript pass. Changed-file lint passes with zero warnings. Normal Turbopack production build passes using an isolated, unavailable dummy database; no production data was used.
- Independent specification and quality reviews passed with no actionable findings.
- Mobile-width (390px) built-app browser checks use synthetic public/private API fixtures. Empty and one-point histories do not request the 347,954-byte Recharts chunk; populated histories request it separately and render, including Hide prices. No client errors were observed.
- Scanner browser check uses the existing real ONNX model with a simulated camera in desktop Edge. The model downloads before any camera request; opening twice uses one model download, no successful-path HEAD request, one game-scoped index preparation, and no background matching POST. Camera opening through Ready measured 2,282ms first and 854ms second in this local check; these include simulated camera/model preparation and are not phone card-recognition benchmarks.
- Public cache regressions prove shared cold loads, bounded stale responses before background refresh finishes, recovery after failure, and separate game/language keys. Scoped Sets test scans 3 matching rows rather than 103 mixed-scope rows. Ownership/security regressions pass.
- Remote master still equals the tested base c83d348 at publication. Live after-change Sets/chart timings and real phone recognition latency remain pending deployment/device measurement. The original dirty checkout and payments are unchanged.

