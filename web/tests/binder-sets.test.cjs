/* eslint-disable @typescript-eslint/no-require-imports -- Exercise real set handlers with isolated account/catalog fixtures. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function harness(userId = "alice") {
  const base = { tcg: "pokemon", language: "eng", setCode: "svi", setId: "123", setName: "Scarlet & Violet", rarity: "Common", pricesJson: JSON.stringify({ tcgplayer: { currency: "USD", variants: { normal: { market: 2 } } } }) };
  const data = {
    sets: [{ id: "pokemon:123:eng", tcg: "pokemon", code: "SVI", language: "eng", name: "Scarlet & Violet", total: 198 }],
    cards: [{ ...base, id: "tp:1", name: "First", cardNumber: "001/198" }, { ...base, id: "tp:2", name: "Second", cardNumber: "002/198" }, { ...base, id: "dex:1", name: "First", cardNumber: "1" }],
    portfolios: [{ id: 1, userId: "alice", name: "My binder" }, { id: 2, userId: "bob", name: "Foreign binder" }, { id: 3, userId: "alice", name: "Other binder" }],
    portfolioItems: [{ id: 11, portfolioId: 1, cardId: "tp:1", quantity: 2 }, { id: 12, portfolioId: 1, cardId: "dex:1", quantity: 1 }, { id: 22, portfolioId: 2, cardId: "tp:2", quantity: 8 }, { id: 33, portfolioId: 3, cardId: "tp:2", quantity: 1 }],
  };
  const scans = [], cacheKeys = [];
  const schema = new Proxy({}, { get: (_, table) => new Proxy({ table }, { get: (target, key) => key === "table" ? target.table : { table, column: key } }) });
  const val = (value, row) => {
    if (value?.column) return row[value.table]?.[value.column];
    if (value?.strings) {
      const text = value.strings.join("").toLowerCase();
      if (text.includes(" like 'tp:%'")) return row.cards.id.startsWith("tp:");
      if (text.includes("card_number is not null")) return row.cards.cardNumber != null;
      if (text.includes("card_number is null")) return row.cards.cardNumber == null;
      if (text.startsWith("lower(")) return val(value.args[0], row)?.toLowerCase();
      if (text.startsWith("case when")) {
        const number = val(value.args[0], row);
        if (number == null) return null;
        if (!text.includes("regexp_replace")) return number.trim().toLowerCase();
        const literals = [...text.matchAll(/'([^']*)'/g)].map((match) => match[1]);
        let pattern = literals[2];
        // PostgreSQL ARE takes branch greediness from its first quantified atom.
        if (pattern.includes("*?")) pattern = pattern.replace("0+", "0+?");
        return number.trim().toLowerCase().replace(new RegExp(literals[0]), "").replace(new RegExp(pattern), "$1$2");
      }
      if (text === "1=1") return true;
    }
    return value;
  };
  const orm = {
    eq: (a, b) => (row) => val(a, row) === val(b, row),
    and: (...conditions) => (row) => conditions.filter(Boolean).every((condition) => condition(row)),
    or: (...conditions) => (row) => conditions.filter(Boolean).some((condition) => condition(row)),
    inArray: (column, values) => (row) => (Array.isArray(values) ? values : values.run().map((r) => Object.values(r)[0])).includes(val(column, row)),
    isNotNull: (column) => (row) => val(column, row) != null,
    isNull: (column) => (row) => val(column, row) == null,
    gt: (a, b) => (row) => val(a, row) > val(b, row),
    sql: (strings, ...args) => ({ strings, args }),
  };
  const db = { select: (selection) => ({
    predicates: [], joins: [],
    from(table) { this.table = table.table; return this; },
    where(condition) { this.predicates.push(condition); return this; },
    innerJoin(table, on) { this.joins.push([table.table, on]); return this; },
    groupBy(...columns) { this.groups = columns; return this; },
    orderBy() { return this; }, limit(max) { this.max = max; return this; },
    run() {
      let rows = data[this.table].map((r) => ({ [this.table]: r }));
      for (const [table, on] of this.joins) rows = rows.flatMap((row) => data[table].map((r) => ({ ...row, [table]: r })).filter(on));
      rows = rows.filter((row) => this.predicates.every((condition) => typeof condition === "function" ? condition(row) : val(condition, row)));
      if (this.max != null) rows = rows.slice(0, this.max);
      if (this.groups && this.table === "cards") scans.push(rows.length);
      const groups = this.groups ? [...Map.groupBy(rows, (row) => JSON.stringify(this.groups.map((column) => val(column, row)))).values()] : rows.map((row) => [row]);
      return groups.map((group) => !selection ? group[0][this.table] : Object.fromEntries(Object.entries(selection).map(([key, value]) => {
        if (Array.isArray(value?.strings) && value.strings.join("").startsWith("count(distinct")) return [key, new Set(group.map((row) => val(value.args[0], row)).filter((v) => v != null)).size];
        return [key, value?.table && typeof value.column !== "string" ? group[0][value.table] : val(value, group[0])];
      })));
    },
    then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject); },
  }) };
  const stubs = {
    "@/db": { db, schema }, "drizzle-orm": orm, "next/server": { NextResponse: Response },
    "@/lib/auth": { auth: async () => userId ? { user: { id: userId } } : null },
    "@/lib/cards": { listSets: async () => data.sets, rowToCard: (row) => ({ ...row, prices: JSON.parse(row.pricesJson ?? "{}") }) },
    "@/lib/cache": { cached: (key, _ttl, fn) => { cacheKeys.push(key); return fn(); }, cachedPublicCatalog: (key, _ttl, fn) => { cacheKeys.push(key); return fn(); } },
    "@/lib/user-settings": { getUserSetting: async () => "USD" },
    "@/lib/currency": { getRates: async () => ({}), convert: (amount) => amount },
  };
  const modules = {};
  function load(file) {
    const filename = path.resolve(__dirname, "..", file);
    if (modules[filename]) return modules[filename].exports;
    const compiled = { exports: {} }; modules[filename] = compiled;
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext("(function(require,module,exports){" + code + "\n})", { Response, URL, URLSearchParams, console })(
      (name) => stubs[name] ?? (name.startsWith("@/") ? load("src/" + name.slice(2) + ".ts") : name.startsWith(".") ? load(path.relative(path.resolve(__dirname, ".."), path.resolve(path.dirname(filename), name)) + ".ts") : require(name)), compiled, compiled.exports);
    return compiled.exports;
  }
  const request = (query = "") => ({ nextUrl: new URL("https://example.test/api/sets" + query) });
  return { data, load, request, scans, cacheKeys };
}
const ctx = { params: Promise.resolve({ id: "pokemon:123:eng" }) };

test("set totals use codes rather than numeric catalog IDs", async () => {
  const h = harness();
  const response = await h.load("src/app/api/sets/route.ts").GET(h.request());
  const result = await response.json();
  assert.equal(result.sets[0].total, 2);
  assert.equal(result.sets[0].owned, 2);
});

test("a single-card imported set remains visible", async () => {
  const h = harness(); h.data.cards = [h.data.cards[0]]; h.data.portfolioItems = [h.data.portfolioItems[0]];
  const result = await (await h.load("src/app/api/sets/route.ts").GET(h.request())).json();
  assert.equal(result.sets.length, 1);
  assert.equal(result.sets[0].owned, 1);
});

test("set details match mixed-case codes and preserve quantities across duplicate sources", async () => {
  const h = harness();
  const result = await (await h.load("src/app/api/sets/[id]/route.ts").GET(h.request("?binderId=1"), ctx)).json();
  assert.equal(result.cards.length, 2);
  assert.equal(result.completion.owned, 1);
  assert.equal(result.cards.find((card) => card.cardNumber.startsWith("001")).owned, 3);
});

test("selected binder scope excludes the collector's other binders", async () => {
  const h = harness();
  const result = await (await h.load("src/app/api/sets/route.ts").GET(h.request("?binderId=1"))).json();
  assert.equal(result.sets[0].owned, 1);
});

for (const route of ["src/app/api/sets/route.ts", "src/app/api/sets/[id]/route.ts"]) {
  test(`${route} rejects foreign and invalid binder scopes`, async () => {
    const h = harness(); const { GET } = h.load(route);
    assert.equal((await GET(h.request("?binderId=2"), ctx)).status, 404);
    assert.equal((await GET(h.request("?binderId=nope"), ctx)).status, 400);
    const guest = harness(null);
    assert.equal((await guest.load(route).GET(guest.request("?binderId=1"), ctx)).status, 401);
  });
}
test("all-provider checklist totals match detail and zero quantities are not owned", async () => {
  const h = harness();
  h.data.cards.push({ ...h.data.cards[0], id: "dex:3", cardNumber: "003", name: "Third" });
  h.data.portfolioItems.push({ id: 44, portfolioId: 1, cardId: "dex:3", quantity: 1 });
  const list = await (await h.load("src/app/api/sets/route.ts").GET(h.request())).json();
  const detail = await (await h.load("src/app/api/sets/[id]/route.ts").GET(h.request(), ctx)).json();
  assert.equal(list.sets[0].total, 3);
  assert.equal(list.sets[0].owned, detail.completion.owned);
  for (const item of h.data.portfolioItems) item.quantity = 0;
  const empty = await (await h.load("src/app/api/sets/route.ts").GET(h.request())).json();
  assert.equal(empty.sets[0].owned, 0);
});
test("filtered catalogue totals do not scan other games or reuse their cache key", async () => {
  const h = harness();
  h.data.cards.push(...Array.from({ length: 100 }, (_, i) => ({ ...h.data.cards[0], id: 'mtg:' + i, tcg: 'mtg', cardNumber: String(i) })));
  const { GET } = h.load('src/app/api/sets/route.ts');
  await GET(h.request('?tcg=pokemon&lang=eng'));
  assert.equal(h.scans[0], 3);
  await GET(h.request('?tcg=mtg&lang=jap'));
  assert.equal(h.scans[1], 0);
  assert.notEqual(h.cacheKeys[0], h.cacheKeys[1]);
});
