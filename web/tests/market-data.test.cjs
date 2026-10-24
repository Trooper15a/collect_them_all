/* eslint-disable @typescript-eslint/no-require-imports -- Exercise real handlers with isolated data and HTTP fixtures. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function harness({ card, results = [], cache = new Map() } = {}) {
  const requests = [];
  const schema = { apiCache: { key: "key", expiresAt: "expiresAt" }, cards: { id: "id" } };
  const orm = { eq: (key, value) => [key, value], gt: (key, value) => [key, value], and: (...clauses) => clauses };
  const db = {
    select: () => ({ from: (table) => ({ where: (clause) => {
      if (table === schema.cards) return Promise.resolve(card ? [card] : []);
      const key = Array.isArray(clause[0]) ? clause[0][1] : clause[1];
      return Promise.resolve(cache.has(key) ? [cache.get(key)] : []);
    } }) }),
    insert: () => ({ values: (value) => ({ onConflictDoUpdate: async () => cache.set(value.key, value) }) }),
  };
  function load(file) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src", file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, {
      exports, Buffer, URLSearchParams, AbortSignal, console,
      process: { env: { EBAY_CLIENT_ID: "fixture", EBAY_CLIENT_SECRET: "fixture" } },
      require: (name) => {
        if (name === "@/db") return { db, schema };
        if (name === "drizzle-orm") return orm;
        if (name === "next/server") return { NextResponse: { json: (data) => data } };
        throw new Error(`Unexpected dependency: ${name}`);
      },
      fetch: async (url) => {
        requests.push(String(url));
        if (String(url).includes("oauth2/token")) return { ok: true, json: async () => ({ access_token: "fixture", expires_in: 3600 }) };
        if (String(url).includes("universal-search")) return { ok: true, json: async () => ({ results }) };
        if (String(url).includes("card-details")) return { ok: true, json: async () => ({ total_population: 100 }) };
        const query = new URL(url).searchParams.get("q");
        return { ok: true, json: async () => ({ itemSummaries: [{ title: query, price: { value: "10", currency: "USD" } }] }) };
      },
    });
    return exports;
  }
  return { load, requests, cache };
}

const card = { id: "tp:test", name: "Charizard", cardNumber: "199/165", setName: "151" };
const match = { gemrate_id: "correct", name: "Charizard", card_number: "199", set_name: "151" };
const request = { nextUrl: new URL("http://localhost/api/pop?cardId=tp:test") };

for (const [name, change] of [
  ["number", { card_number: "4" }],
  ["set", { set_name: "Base Set" }],
  ["name", { name: "Charizard ex" }],
]) {
  test(`population lookup rejects a different card ${name}`, async () => {
    const h = harness({ card, results: [{ ...match, ...change }] });
    const result = await h.load("app/api/pop/route.ts").GET(request);
    assert.equal(result.found, false);
    assert.equal(h.requests.some((url) => url.includes("card-details")), false);
  });
}

test("population lookup matches normalized numbers and punctuation", async () => {
  const h = harness({
    card: { ...card, name: "Mr. Mime - 025/165", cardNumber: "025/165" },
    results: [{ ...match, name: "Mr Mime", card_number: "25" }],
  });
  assert.equal((await h.load("app/api/pop/route.ts").GET(request)).found, true);
});

test("population lookup declines ambiguous printings", async () => {
  const h = harness({ card, results: [match, { ...match, gemrate_id: "parallel", parallel: "Reverse Holo" }] });
  assert.equal((await h.load("app/api/pop/route.ts").GET(request)).found, false);
});

test("population lookup does not reuse results cached by the old matcher", async () => {
  const cache = new Map([["pop:tp:test", { value: JSON.stringify({ found: true, totalPop: 999 }), expiresAt: Date.now() + 60_000 }]]);
  const h = harness({ card, results: [], cache });
  assert.equal((await h.load("app/api/pop/route.ts").GET(request)).found, false);
});

test("eBay cache separates reprints but reuses the same printing", async () => {
  const h = harness();
  const { getEbaySold } = h.load("lib/ebay.ts");
  await getEbaySold("Raichu", "Base Set", "14", "pokemon");
  const fossil = await getEbaySold("Raichu", "Fossil", "14", "pokemon");
  assert.match(fossil.raw[0].title, /Fossil/);
  assert.equal(fossil.cached, false);
  const requestCount = h.requests.length;
  assert.equal((await getEbaySold("Raichu", "Fossil", "14", "pokemon")).cached, true);
  assert.equal(h.requests.length, requestCount);
});
