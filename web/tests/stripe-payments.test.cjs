/* eslint-disable @typescript-eslint/no-require-imports -- Exercise the real payment service and routes without a live database. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const Stripe = require("stripe");

function load(relative, modules = {}, env = {}) {
  const filename = path.resolve(__dirname, "../src", relative);
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    console: { error() {} }, process: { env }, URL, Request, Response, Buffer,
  }, { filename })((name) => name in modules ? modules[name] : require(name), loaded, loaded.exports);
  return loaded.exports;
}

function fixture(mode = "live") {
  const config = { enabled: true, mode, priceId: "price_premium", appUrl: "https://ripnpull.ca", webhookSecret: "whsec_fixture" };
  const account = { id: "alice", premium: false, stripeCustomerId: "cus_alice" };
  const calls = { created: [], grants: 0, savedCustomers: [], customerCreates: 0 };
  const price = { id: config.priceId, active: true, currency: "usd", unit_amount: 499, recurring: null, type: "one_time", livemode: mode === "live" };
  const session = {
    id: "cs_fixture", mode: "payment", status: "complete", payment_status: "paid", livemode: mode === "live",
    currency: "usd", amount_subtotal: 499, amount_total: 499, customer: "cus_alice",
    client_reference_id: "alice", metadata: { userId: "alice", purchase: "ripnpull_premium_v1", environment: mode },
  };
  const lineItems = { data: [{ price, quantity: 1 }], has_more: false };
  const realStripe = new Stripe("sk_test_fixture");
  const client = {
    prices: { retrieve: async () => price },
    customers: { create: async () => { calls.customerCreates++; return { id: "cus_created" }; } },
    checkout: { sessions: {
      create: async (params, options) => { calls.created.push({ params, options }); return { id: "cs_created", url: "https://checkout.stripe.com/c/pay/cs_created" }; },
      retrieve: async () => session,
      listLineItems: async () => lineItems,
    } },
    webhooks: realStripe.webhooks,
  };
  const configuration = {
    PaymentError: class PaymentError extends Error { constructor(message, status = 400) { super(message); this.status = status; } },
    getPaymentConfig: () => config,
    getStripe: () => client,
    paymentAvailability: () => ({ paymentsEnabled: config.enabled, configured: true, testMode: config.mode === "test" }),
  };
  const repository = {
    getPremiumAccount: async (id) => id === account.id ? { ...account } : null,
    saveStripeCustomer: async (id, customerId) => { assert.equal(id, account.id); calls.savedCustomers.push(customerId); account.stripeCustomerId = customerId; },
    grantPremium: async (id, customerId) => { assert.equal(id, account.id); assert.equal(customerId, account.stripeCustomerId); account.premium = true; calls.grants++; },
  };
  const service = load("lib/stripe-payments.ts", { "@/lib/stripe": configuration, "@/lib/premium": repository });
  function route(name, authenticated = true) {
    return load(`app/api/stripe/${name}/route.ts`, {
      "@/lib/auth": { requireUserId: async () => { if (!authenticated) throw Error("Unauthorized"); return account.id; } },
      "@/lib/stripe": configuration, "@/lib/stripe-payments": service, "@/lib/premium": repository,
    });
  }
  return { config, account, calls, price, session, lineItems, service, route, realStripe };
}

test("checkout uses the server price and user binding, with a scoped idempotency key", async () => {
  const f = fixture();
  await f.service.createPremiumCheckout("alice", "11111111-1111-4111-8111-111111111111");
  const { params, options } = f.calls.created[0];
  assert.equal(params.mode, "payment");
  assert.equal(params.line_items[0].price, "price_premium");
  assert.equal(params.line_items[0].quantity, 1);
  assert.equal(params.client_reference_id, "alice");
  assert.equal(params.metadata.userId, "alice");
  assert.equal(params.metadata.environment, "live");
  assert.equal(params.customer, "cus_alice");
  assert.match(params.success_url, /^https:\/\/ripnpull.ca\/premium\/success\?session_id=/);
  assert.ok(options.idempotencyKey.includes("11111111-1111-4111-8111-111111111111"));
});

test("disabled checkout, unavailable price, premium users and deleted users do not create sessions", async () => {
  for (const mutate of [f => { f.config.enabled = false; }, f => { f.price.unit_amount = 1; }, f => { f.account.premium = true; }, f => { f.account.id = "deleted"; }]) {
    const f = fixture(); mutate(f);
    await assert.rejects(f.service.createPremiumCheckout("alice", "request"));
    assert.equal(f.calls.created.length, 0);
  }
});

test("sandbox customer creation never overwrites a production customer association", async () => {
  const f = fixture("test");
  await f.service.createPremiumCheckout("alice", "request");
  assert.equal(f.calls.created[0].params.customer, "cus_created");
  assert.equal(f.calls.savedCustomers.length, 0);
  assert.equal(f.account.stripeCustomerId, "cus_alice");
});

test("live customer creation persists its association before sending the user to Checkout", async () => {
  const f = fixture(); f.account.stripeCustomerId = null;
  await f.service.createPremiumCheckout("alice", "request");
  assert.equal(f.account.stripeCustomerId, "cus_created");
  assert.equal(f.calls.created[0].params.customer, "cus_created");
});

test("verified live purchases grant Premium only once on duplicate delivery", async () => {
  const f = fixture();
  assert.equal((await f.service.verifyPremiumCheckout("cs_fixture", "alice")).status, "paid");
  assert.equal((await f.service.verifyPremiumCheckout("cs_fixture", "alice")).status, "paid");
  assert.equal(f.calls.grants, 1);
});

test("a paid sandbox Checkout confirms the test without granting production access", async () => {
  const f = fixture("test");
  assert.equal((await f.service.verifyPremiumCheckout("cs_fixture", "alice")).status, "test_paid");
  assert.equal(f.calls.grants, 0);
  assert.equal(f.account.premium, false);
});

test("an unpaid session stays pending without granting Premium", async () => {
  const f = fixture(); f.session.payment_status = "unpaid";
  assert.equal((await f.service.verifyPremiumCheckout("cs_fixture", "alice")).status, "pending");
  assert.equal(f.calls.grants, 0);
});

test("foreign users, wrong prices, quantities, currency, modes and customer bindings cannot unlock Premium", async () => {
  const mutations = [
    f => { f.session.metadata.userId = "bob"; }, f => { f.session.client_reference_id = "bob"; },
    f => { f.lineItems.data[0].price.id = "price_other"; }, f => { f.lineItems.data[0].quantity = 2; },
    f => { f.session.currency = "cad"; }, f => { f.session.livemode = false; },
    f => { f.session.mode = "subscription"; }, f => { f.session.customer = "cus_bob"; },
    f => { f.session.metadata.purchase = "other_product"; }, f => { f.lineItems.has_more = true; },
    f => { f.session.metadata.environment = "test"; },
    f => { f.session.amount_subtotal = 1; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); mutate(f);
    await assert.rejects(f.service.verifyPremiumCheckout("cs_fixture", "alice"));
    assert.equal(f.calls.grants, 0);
  }
});

test("a verified payment is still fulfilled when new purchases are disabled", async () => {
  const f = fixture(); f.config.enabled = false;
  assert.equal((await f.service.verifyPremiumCheckout("cs_fixture", "alice")).status, "paid");
});

test("checkout and purchase status reject anonymous requests", async () => {
  const f = fixture();
  const request = new Request("https://ripnpull.ca/api/stripe/checkout", { method: "POST", headers: { origin: "https://ripnpull.ca" } });
  assert.equal((await f.route("checkout", false).POST(request)).status, 401);
  assert.equal((await f.route("status", false).GET(new Request("https://ripnpull.ca/api/stripe/status"))).status, 401);
});

test("checkout rejects cross-origin requests and requires a bounded retry key", async () => {
  const f = fixture(); const route = f.route("checkout");
  assert.equal((await route.POST(new Request("https://ripnpull.ca/api/stripe/checkout", { method: "POST", headers: { origin: "https://evil.example" } }))).status, 403);
  assert.equal((await route.POST(new Request("https://ripnpull.ca/api/stripe/checkout", { method: "POST", headers: { origin: "https://ripnpull.ca" } }))).status, 400);
});

test("the webhook verifies the unmodified raw body with the real Stripe signature verifier", async () => {
  const f = fixture(); const route = f.route("webhook");
  const payload = JSON.stringify({ id: "evt_paid", type: "checkout.session.completed", livemode: true, data: { object: f.session } });
  const signature = f.realStripe.webhooks.generateTestHeaderString({ payload, secret: f.config.webhookSecret });
  const request = body => new Request("https://ripnpull.ca/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body });
  assert.equal((await route.POST(request(payload + " "))).status, 400);
  assert.equal(f.calls.grants, 0);
  assert.equal((await route.POST(request(payload))).status, 200);
  assert.equal(f.calls.grants, 1);
  assert.equal((await route.POST(new Request("https://ripnpull.ca/api/stripe/webhook", { method: "POST", body: payload }))).status, 400);
});

test("webhook storage failures remain retryable", async () => {
  const f = fixture(); f.service.verifyPremiumCheckout = async () => { throw Error("Database unavailable"); };
  const payload = JSON.stringify({ type: "checkout.session.async_payment_succeeded", data: { object: f.session } });
  const signature = f.realStripe.webhooks.generateTestHeaderString({ payload, secret: f.config.webhookSecret });
  const response = await f.route("webhook").POST(new Request("https://ripnpull.ca/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }));
  assert.equal(response.status, 500);
});

test("configuration stays disabled by default and rejects missing settings, mismatched key mode and unsafe return origins", () => {
  const stripe = load("lib/stripe.ts");
  assert.equal(stripe.paymentAvailability().paymentsEnabled, false);
  assert.throws(() => stripe.getPaymentConfig());
  const env = { PAYMENTS_ENABLED: "true", STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_PRICE_ID: "price_premium", STRIPE_WEBHOOK_SECRET: "whsec_fixture", STRIPE_APP_URL: "http://localhost:3040" };
  assert.equal(load("lib/stripe.ts", {}, env).getPaymentConfig().mode, "test");
  assert.throws(() => load("lib/stripe.ts", {}, { ...env, STRIPE_MODE: "live" }).getPaymentConfig());
  assert.throws(() => load("lib/stripe.ts", {}, { ...env, STRIPE_APP_URL: "http://example.com" }).getPaymentConfig());
});

test("only the exact signed webhook endpoint bypasses browser-session authentication", () => {
  const config = load("lib/auth.config.ts", { "next-auth/providers/google": () => ({}) }).default;
  const allowed = pathname => config.callbacks.authorized({ auth: null, request: { nextUrl: new URL(`https://ripnpull.ca${pathname}`) } });
  assert.equal(allowed("/api/stripe/webhook"), true);
  assert.equal(allowed("/api/stripe/checkout"), false);
  assert.equal(allowed("/api/stripe/webhook/other"), false);
});

test("a failed startup migration can recover on the next payment request", async () => {
  let fail = true, attempts = 0;
  const client = { unsafe: async query => {
    if (query.includes("premium BOOLEAN")) { attempts++; if (fail) throw Error("Temporary database outage"); }
  } };
  const database = load("db/index.ts", {
    postgres: () => client, "drizzle-orm/postgres-js": { drizzle: () => ({}) }, "./schema": {},
  });
  await new Promise(setImmediate);
  fail = false;
  await database.ensurePremiumSchema();
  await database.ensurePremiumSchema();
  assert.equal(attempts, 2, "successful retry is cached, rejected initialization is not");
});
