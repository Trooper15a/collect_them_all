/* eslint-disable @typescript-eslint/no-require-imports -- Render purchase states and event handlers with the existing component harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clientHarness, nodes, text } = require("./client-harness.cjs");

function purchase({ session = { user: { id: "alice" } }, availability = { premium: false, configured: true, paymentsEnabled: true, testMode: true }, failCheckout = false } = {}) {
  const requests = [], redirects = [];
  const auth = { data: session, status: session ? "authenticated" : "unauthenticated" };
  const harness = clientHarness("components/PremiumPurchase.tsx", {
    exportName: "PremiumPurchase",
    extraModules: { "next-auth/react": { useSession: () => auth }, "@/components/ui": { Button: "button" } },
    globals: { crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" }, window: { location: { assign: url => redirects.push(url) } } },
    fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith("/checkout")) return { ok: !failCheckout, json: async () => failCheckout ? { error: "Please retry." } : { url: "https://checkout.stripe.com/c/pay/cs_test_preview" } };
      return { ok: true, json: async () => availability };
    },
  });
  return { ...harness, requests, redirects, auth };
}

test("guests see sign-in instead of a payment action", () => {
  const h = purchase({ session: null });
  const tree = h.render();
  assert.match(text(tree), /Sign in/);
  assert.equal(nodes(tree, node => node.type === "a" && node.props.href.includes("callbackUrl")).length, 1);
  assert.equal(h.requests.length, 0);
});

test("unconfigured checkout stays unavailable without advertising paused grading", async () => {
  const h = purchase({ availability: { premium: false, configured: false, paymentsEnabled: false, testMode: true } });
  h.render(); await h.flush(); const tree = h.render();
  assert.match(text(tree), /not available/i);
  assert.doesNotMatch(text(tree), /grading|priority alerts/i);
  assert.equal(nodes(tree, node => node.type === "button" && /checkout/i.test(text(node))).length, 0);
});

test("sandbox checkout is clearly labeled and sends a stable retry key", async () => {
  const h = purchase(); h.render(); await h.flush(); let tree = h.render();
  assert.match(text(tree), /test|sandbox/i);
  const button = nodes(tree, node => node.type === "button" && /checkout/i.test(text(node)))[0];
  assert.ok(button);
  await button.props.onClick();
  const request = h.requests.find(request => request.url.endsWith("/checkout"));
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Idempotency-Key"], "11111111-1111-4111-8111-111111111111");
  assert.deepEqual(h.redirects, ["https://checkout.stripe.com/c/pay/cs_test_preview"]);
});

test("checkout errors offer retry and reuse the request key", async () => {
  const h = purchase({ failCheckout: true }); h.render(); await h.flush();
  for (let i = 0; i < 2; i++) {
    const button = nodes(h.render(), node => node.type === "button" && /checkout/i.test(text(node)))[0];
    await button.props.onClick();
  }
  assert.match(text(h.render()), /Please retry/);
  const attempts = h.requests.filter(request => request.url.endsWith("/checkout"));
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0].options.headers["Idempotency-Key"], attempts[1].options.headers["Idempotency-Key"]);
  assert.equal(h.redirects.length, 0);
});

test("a different account never inherits an already-premium message", async () => {
  const h = purchase({ availability: { premium: true, configured: true, paymentsEnabled: true, testMode: false } });
  h.render(); await h.flush(); assert.match(text(h.render()), /already have Premium/i);
  h.auth.data = { user: { id: "bob" } };
  assert.doesNotMatch(text(h.render()), /already have Premium/i);
});

test("switching accounts during checkout does not leave the original account permanently busy", async () => {
  const auth = { data: { user: { id: "alice" } }, status: "authenticated" };
  const h = clientHarness("components/PremiumPurchase.tsx", {
    exportName: "PremiumPurchase",
    extraModules: { "next-auth/react": { useSession: () => auth }, "@/components/ui": { Button: "button" } },
    globals: { crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" } },
    fetch: async (url, options) => {
      if (url.endsWith("/checkout")) return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted"))));
      return { ok: true, json: async () => ({ premium: false, configured: true, paymentsEnabled: true, testMode: true }) };
    },
  });
  h.render(); await h.flush();
  const pending = nodes(h.render(), node => node.type === "button" && /checkout/i.test(text(node)))[0].props.onClick();
  assert.equal(nodes(h.render(), node => node.type === "button" && /checkout/i.test(text(node)))[0].props.disabled, true);
  auth.data = { user: { id: "bob" } }; h.render(); await h.flush(); await pending;
  auth.data = { user: { id: "alice" } }; h.render(); await h.flush();
  const button = nodes(h.render(), node => node.type === "button" && /checkout/i.test(text(node)))[0];
  assert.equal(button.props.disabled, false);
  assert.equal(text(button), "Open test checkout");
});

function confirmation(sessionId, result) {
  return clientHarness("components/PurchaseConfirmation.tsx", {
    props: { sessionId }, exportName: "PurchaseConfirmation",
    extraModules: { "@/components/ui": { Button: "button" } },
    fetch: async () => ({ ok: true, json: async () => result }),
  });
}

test("opening a success URL without a session does not claim payment succeeded", () => {
  const h = confirmation(null, {});
  assert.match(text(h.render()), /purchase reference/i);
  assert.doesNotMatch(text(h.render()), /payment confirmed|welcome to Premium/i);
});

test("pending payments remain pending and offer an explicit check", async () => {
  const h = confirmation("cs_test_fixture", { status: "pending", premium: false, testMode: true });
  h.render(); await h.flush(); const tree = h.render();
  assert.match(text(tree), /not confirmed|pending/i);
  assert.equal(nodes(tree, node => node.type === "button" && /check again/i.test(text(node))).length, 1);
  assert.doesNotMatch(text(tree), /welcome to Premium/i);
});

test("a paid test purchase is distinguished from a live entitlement", async () => {
  const h = confirmation("cs_test_fixture", { status: "test_paid", premium: false, testMode: true });
  h.render(); await h.flush(); const tree = h.render();
  assert.match(text(tree), /Test purchase confirmed/);
  assert.match(text(tree), /No real payment/);
  assert.doesNotMatch(text(tree), /Premium is active/);
});

test("only a verified live purchase says Premium is active", async () => {
  const h = confirmation("cs_live_fixture", { status: "paid", premium: true, testMode: false });
  h.render(); await h.flush();
  assert.match(text(h.render()), /Premium is active/);
});
