/* eslint-disable @typescript-eslint/no-require-imports -- Isolated fixtures run real handlers without a live database. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const card = { id: "tp:test", prices: { tcgplayer: { currency: "USD", variants: { holofoil: { market: 100 }, normal: { market: 10 } } } } };
const saved = { id: 11, portfolioId: 1, cardId: card.id, quantity: 3, variantType: "normal", condition: "LP", isGraded: false, gradingCompany: null, grade: null };
function harness(userId = "alice") {
  const items = [saved, { ...saved, id: 22, portfolioId: 2 }, { ...saved, id: 33, cardId: "tp:other" }];
  const binders = [{ id: 1, userId: "alice", name: "My binder" }, { id: 2, userId: "bob", name: "Private binder" }];
  const schema = Object.fromEntries(["portfolioItems", "portfolios"].map(table => [table, new Proxy({ table }, { get: (o, key) => key === "table" ? table : { table, key } })]));
  const value = (x, row) => x?.table ? row[x.table]?.[x.key] : x;
  const orm = { eq: (a, b) => row => value(a, row) === value(b, row), and: (...ps) => row => ps.every(p => p(row)) };
  let authCalls = 0;
  const historyCalls = [];
  const db = { select: selection => {
    const q = { from: () => q, innerJoin: () => q, where: predicate => { q.predicate = predicate; return q; }, limit: async () => items.flatMap(item => binders.map(binder => ({ portfolioItems: item, portfolios: binder }))).filter(row => row.portfolioItems.portfolioId === row.portfolios.id && q.predicate(row)).map(row => Object.fromEntries(Object.entries(selection).map(([key, col]) => [key, col.key ? value(col, row) : row[col.table]]))) };
    return q;
  } };
  const stubs = {
    "@/db": { db, schema }, "drizzle-orm": orm, "next/server": { NextResponse: Response },
    "@/lib/auth": { requireUserId: async () => { authCalls++; if (!userId) throw Error("Unauthorized"); return userId; } },
    "@/lib/cards": { getCard: async () => card, getPriceHistory: async (...args) => { historyCalls.push(args); return [{ date: "2026-10-23", tcgplayerMarket: args[1] === "normal" ? 10 : 100 }]; } },
    "@/lib/currency": { getRates: async () => ({ rates: { USD: 1, CAD: 1.4 } }) },
    "@/lib/user-settings": { getUserSetting: async () => "CAD" },
  };
  function load(relative) {
    const file = path.join(__dirname, "../src", relative), exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, console, URL, require: name => stubs[name] ?? load(name.startsWith("@/") ? name.slice(2) + ".ts" : path.relative(path.join(__dirname, "../src"), path.resolve(path.dirname(file), name + ".ts"))) });
    return exports;
  }
  return { load, historyCalls, get authCalls() { return authCalls; }, get: query => load("app/api/cards/[id]/route.ts").GET({ nextUrl: new URL("https://example.test/api/cards/tp%3Atest" + query) }, { params: Promise.resolve({ id: "tp%3Atest" }) }) };
}
test("owned Normal LP values stay on that finish even with holo first", () => {
  const { unitValue } = harness().load("lib/valuation.ts");
  const value = unitValue(card, "normal", "LP", false, null, null);
  assert.equal(value.amount, 8.5); assert.equal(value.raw, 10); assert.equal(value.variant, "normal");
  assert.equal(unitValue(card, "reverseHolofoil", "NM", false, null, null), null);
  assert.equal(unitValue(card, "normal", "LP", true, "PSA", "10").amount, 30);
});
for (const itemId of ["", "0", "-1", "1.5", "1e1", "abc", "9007199254740992"]) {
  test(`card context rejects invalid item id ${JSON.stringify(itemId)}`, async () => { assert.equal((await harness().get("?itemId=" + itemId)).status, 400); });
}
test("catalog reads stay public and prefer Normal history", async () => {
  const h = harness(null), response = await h.get("");
  assert.equal(response.status, 200); assert.equal(h.authCalls, 0); assert.equal(h.historyCalls[0][1], "normal"); assert.equal((await response.json()).variant, "normal");
});
test("catalog finish selection fetches matching history", async () => { const h = harness(null); await h.get("?variant=holofoil"); assert.equal(h.historyCalls[0][1], "holofoil"); });
test("saved copy returns private context and strictly matching history", async () => {
  const h = harness(), response = await h.get("?itemId=11&variant=holofoil");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.item, { id: 11, portfolioId: 1, portfolioName: "My binder", quantity: 3, variantType: "normal", condition: "LP", isGraded: false, gradingCompany: null, grade: null });
  assert.equal(data.variant, "normal"); assert.equal(h.historyCalls[0][1], "normal");
});
for (const [user, itemId, status] of [[null, 11, 401], ["alice", 22, 404], ["alice", 33, 404], ["alice", 999, 404]]) {
  test(`item ${itemId} is protected for ${user}`, async () => {
    const h = harness(user), response = await h.get("?itemId=" + itemId);
    assert.equal(response.status, status); assert.equal(h.historyCalls.length, 0); assert.equal((await response.text()).includes("Private binder"), false);
  });
}
