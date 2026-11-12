/* eslint-disable @typescript-eslint/no-require-imports -- Exercise actual client components with the project's hook harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clientHarness, nodes, text } = require("./client-harness.cjs");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
const response = (eligible = false) => ({ ok: true, json: async () => ({ eligible }) });

function gate({ pathname = "/", status = "authenticated", userId = "alice", replies = [] } = {}) {
  const state = { pathname, status, userId };
  const requests = [], redirects = [];
  const children = { type: "main", props: { children: "Collection content" } };
  const router = { replace: (href) => redirects.push(href) };
  const harness = clientHarness("components/OnboardingGate.tsx", {
    exportName: "OnboardingGate",
    props: { children },
    extraModules: {
      "next/navigation": { usePathname: () => state.pathname, useRouter: () => router },
      "next-auth/react": { useSession: () => ({ status: state.status, data: state.userId ? { user: { id: state.userId } } : null }) },
    },
    fetch: async (url, options) => {
      requests.push({ url, ...options });
      return replies.length ? await replies.shift() : response();
    },
  });
  return { ...harness, state, requests, redirects, children };
}
function showsContent(h, tree = h.render()) {
  assert.ok(nodes(tree, (node) => node === h.children).length, "collection children should render immediately");
}
function isChecking(tree) { return nodes(tree, (node) => node.props.role === "status").length > 0; }

test("successful admission checks once across all four primary destinations", async () => {
  const h = gate();
  assert.ok(isChecking(h.render()));
  await h.flush();
  showsContent(h);
  const immediateContent = [];
  for (const pathname of ["/portfolios", "/sets", "/scan"]) {
    h.state.pathname = pathname;
    immediateContent.push(nodes(h.render(), (node) => node === h.children).length > 0);
    await h.flush();
    showsContent(h);
  }
  assert.equal(h.requests.length, 1);
  assert.ok(immediateContent.every(Boolean), "every admitted route must show children before its effects run");
  assert.equal(h.requests[0].url, "/api/onboarding");
  assert.equal(h.requests[0].cache, "no-store");
});

test("pending new collectors stay blocked and are redirected to the introduction", async () => {
  const pending = deferred();
  const h = gate({ replies: [pending.promise] });
  assert.ok(isChecking(h.render()));
  await h.flush();
  assert.ok(isChecking(h.render()));
  pending.resolve(response(true));
  await h.flush();
  assert.deepEqual(h.redirects, ["/onboarding"]);
  assert.ok(isChecking(h.render()));
});

test("an account change cannot reuse the preceding account's successful admission", async () => {
  const h = gate({ replies: [response(), response(true)] });
  h.render(); await h.flush(); showsContent(h);
  h.state.userId = "bob";
  assert.ok(isChecking(h.render()));
  await h.flush();
  assert.equal(h.requests.length, 2);
  assert.deepEqual(h.redirects, ["/onboarding"]);
});

test("sign-out invalidates admission even when the same collector signs back in", async () => {
  const h = gate();
  h.render(); await h.flush(); showsContent(h);
  h.state.status = "unauthenticated";
  h.state.userId = null;
  showsContent(h); await h.flush();
  h.state.status = "authenticated";
  h.state.userId = "alice";
  assert.ok(isChecking(h.render()));
  await h.flush(); showsContent(h);
  assert.equal(h.requests.length, 2);
});

test("switching back to a prior account still requires a fresh check", async () => {
  const h = gate();
  h.render(); await h.flush(); showsContent(h);
  for (const userId of ["bob", "alice"]) {
    h.state.userId = userId;
    assert.ok(isChecking(h.render()));
    await h.flush(); showsContent(h);
  }
  assert.equal(h.requests.length, 3);
});

test("session hydration waits for the authenticated account before checking", async () => {
  const h = gate({ status: "loading", userId: null });
  assert.ok(isChecking(h.render())); await h.flush();
  assert.equal(h.requests.length, 0);
  h.state.status = "authenticated";
  h.state.userId = "alice";
  assert.ok(isChecking(h.render())); await h.flush(); showsContent(h);
  assert.equal(h.requests.length, 1);
});

for (const destination of ["/", "/portfolios/new-binder"]) {
  test(`Settings introduction restart rechecks on return to ${destination}`, async () => {
    const h = gate({ pathname: "/settings" });
    h.render(); await h.flush(); showsContent(h);
    h.state.pathname = "/onboarding";
    showsContent(h); await h.flush();
    h.state.pathname = destination;
    assert.ok(isChecking(h.render()));
    await h.flush(); showsContent(h);
    assert.equal(h.requests.length, 2);
  });
}

test("a failed check fails open with an explicit retry and no automatic effect loop", async () => {
  const h = gate({ replies: [{ ok: false }, response()] });
  h.render(); await h.flush();
  let tree = h.render();
  showsContent(h, tree);
  const retry = nodes(tree, (node) => node.type === "button" && text(node) === "Check introduction")[0];
  assert.ok(retry);
  assert.equal(retry.props.type, "button");
  await h.flush(); h.render(); await h.flush();
  assert.equal(h.requests.length, 1);
  retry.props.onClick();
  assert.ok(isChecking(h.render()));
  await h.flush();
  tree = h.render(); showsContent(h, tree);
  assert.equal(nodes(tree, (node) => node.type === "button").length, 0);
  assert.equal(h.requests.length, 2);
  h.state.pathname = "/scan";
  showsContent(h); await h.flush();
  assert.equal(h.requests.length, 2);
});

test("public and introduction routes bypass the initial eligibility check", async () => {
  for (const pathname of ["/landing", "/login", "/privacy", "/terms", "/faq", "/auth/error", "/onboarding", "/onboarding/first-card", "/card-show/event"]) {
    const h = gate({ pathname });
    showsContent(h); await h.flush();
    assert.equal(h.requests.length, 0, pathname);
  }
});

test("visiting another bypass route preserves an existing account admission", async () => {
  const h = gate();
  h.render(); await h.flush(); showsContent(h);
  h.state.pathname = "/card-show";
  showsContent(h); await h.flush();
  h.state.pathname = "/sets";
  showsContent(h); await h.flush();
  assert.equal(h.requests.length, 1);
});

for (const staleEligible of [false, true]) {
  test(`stale account response (eligible=${staleEligible}) cannot admit or redirect the new account`, async () => {
    const alice = deferred(), bob = deferred();
    const h = gate({ replies: [alice.promise, bob.promise] });
    h.render(); await h.flush();
    h.state.userId = "bob";
    assert.ok(isChecking(h.render())); await h.flush();
    assert.equal(h.requests[0].signal.aborted, true);
    alice.resolve(response(staleEligible)); await h.flush();
    assert.ok(isChecking(h.render()));
    assert.deepEqual(h.redirects, []);
    bob.resolve(response(true)); await h.flush();
    assert.deepEqual(h.redirects, ["/onboarding"]);
    assert.equal(h.requests.length, 2);
  });
}

test("entering the introduction cancels an in-flight eligibility response", async () => {
  const pending = deferred();
  const h = gate({ replies: [pending.promise] });
  h.render(); await h.flush();
  h.state.pathname = "/onboarding";
  showsContent(h); await h.flush();
  assert.equal(h.requests[0].signal.aborted, true);
  pending.resolve(response(true)); await h.flush();
  assert.deepEqual(h.redirects, []);
  h.state.pathname = "/";
  assert.ok(isChecking(h.render())); await h.flush(); showsContent(h);
  assert.equal(h.requests.length, 2);
});

test("route loading exposes an accessible in-content skeleton without covering navigation", () => {
  const tree = clientHarness("app/loading.tsx").render();
  const status = nodes(tree, (node) => node.props.role === "status")[0];
  assert.ok(status, "loading must be announced as a status");
  assert.equal(status.props["aria-label"], "Loading page");
  assert.equal(status.props["aria-live"], "polite");
  assert.ok(nodes(tree, (node) => /\bskeleton\b/.test(node.props.className || "")).length);
  for (const node of nodes(tree, () => true)) {
    assert.doesNotMatch(node.props.className || "", /\b(?:fixed|absolute|inset-0|h-screen|min-h-screen)\b/);
    assert.notEqual(node.props.style?.position, "fixed");
  }
});
