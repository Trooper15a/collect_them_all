/* eslint-disable @typescript-eslint/no-require-imports -- Execute real cache behavior with deterministic DB/time fixtures. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), ts = require("typescript");
function harness() {
  let now = 100000;
  const rows = new Map(), scheduled = [], errors = [];
  const db = {
    select: () => ({ from: () => ({ where: ({ value }) => ({ limit: async () => rows.has(value) ? [rows.get(value)] : [] }) }) }),
    insert: () => ({ values: (value) => ({ onConflictDoUpdate: async () => { rows.set(value.key, value); } }) }),
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/cache.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, Date: { now: () => now }, console: { error: (...args) => errors.push(args), warn: (...args) => errors.push(args) },
    require: (name) => name === "@/db" ? { db, schema: { apiCache: { key: "key" } } } : name === "drizzle-orm" ? { eq: (_key, value) => ({ value }), lt: () => ({}) } : require(name),
  });
  const cache = (...args) => { assert.equal(typeof exports.cachedPublicCatalog, "function", "public metadata needs a single-flight stale cache"); return exports.cachedPublicCatalog(...args); };
  return { cache, rows, scheduled, errors, advance: (ms) => { now += ms; }, options: { staleWhileRevalidateSeconds: 120, schedule: (task) => scheduled.push(task) } };
}
test("concurrent cold catalogue requests share one calculation", async () => {
  const h = harness(); let calls = 0, release;
  const fetcher = async () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const first = h.cache("public:sets", 10, fetcher, h.options);
  const second = h.cache("public:sets", 10, fetcher, h.options);
  await new Promise(setImmediate);
  assert.equal(calls, 1); release({ count: 20 });
  assert.equal((await first).count, 20); assert.equal((await second).count, 20);
});
test("stale catalogue metadata returns before its one scheduled refresh", async () => {
  const h = harness(); h.rows.set("public:sets", { key: "public:sets", value: JSON.stringify({ count: 20 }), expiresAt: 99000 });
  let calls = 0;
  const fetcher = async () => { calls++; return { count: 21 }; };
  assert.equal((await h.cache("public:sets", 10, fetcher, h.options)).count, 20);
  assert.equal((await h.cache("public:sets", 10, fetcher, h.options)).count, 20);
  assert.equal(calls, 0); assert.equal(h.scheduled.length, 1);
  await h.scheduled.shift()();
  assert.equal((await h.cache("public:sets", 10, fetcher, h.options)).count, 21);
});
test("catalogue refresh errors preserve a usable stale result; too-old results block for fresh data", async () => {
  const h = harness(); h.rows.set("public:sets", { key: "public:sets", value: JSON.stringify({ count: 20 }), expiresAt: 99000 });
  const fail = async () => { throw Error("offline"); };
  assert.equal((await h.cache("public:sets", 10, fail, h.options)).count, 20);
  await h.scheduled.shift()();
  assert.equal((await h.cache("public:sets", 10, fail, h.options)).count, 20);
  h.advance(121000);
  assert.equal((await h.cache("public:sets", 10, async () => ({ count: 30 }), h.options)).count, 30);
});
test("different catalogue scopes do not share values or an in-flight refresh", async () => {
  const h = harness();
  assert.equal(await h.cache("sets:pokemon:eng", 10, async () => "pokemon", h.options), "pokemon");
  assert.equal(await h.cache("sets:mtg:jap", 10, async () => "mtg", h.options), "mtg");
});
