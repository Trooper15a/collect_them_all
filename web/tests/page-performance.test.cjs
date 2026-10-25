/* eslint-disable @typescript-eslint/no-require-imports -- Verify real handlers with gated independent reads. */
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), ts = require("typescript");
function deferred() { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; }
function load(file, stubs, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { exports, URL, console, require: name => { extra.onRequire?.(name); return stubs[name] ?? require(name); }, ...extra });
  return exports;
}
const schema = new Proxy({}, { get: () => new Proxy({}, { get: (_, key) => key }) });
const common = { "next/server": { NextResponse: Response }, "drizzle-orm": { eq() {}, and() {}, or() {}, sql() {} }, "@/lib/auth": { requireUserId: async () => "alice" }, "@/lib/types": { TCG_IDS: ["pokemon"] }, "@/lib/format": { RANGES: ["1M"] } };
const request = { nextUrl: new URL("https://example.test/api?range=1M") };

test("card history, exchange rates and display currency load concurrently", async () => {
  const gates = [deferred(), deferred(), deferred()], started = [];
  const { GET } = load("app/api/cards/[id]/route.ts", { ...common,
    "@/db": { db: {}, schema },
    "@/lib/cards": { getCard: async () => ({ id: "tp:1", prices: {} }), getPriceHistory: () => { started.push("history"); return gates[0].promise; } },
    "@/lib/currency": { getRates: () => { started.push("fx"); return gates[1].promise; } },
    "@/lib/user-settings": { getUserSetting: () => { started.push("currency"); return gates[2].promise; } },
    "@/lib/valuation": { defaultVariant: () => "normal" },
  });
  const response = GET(request, { params: Promise.resolve({ id: "tp:1" }) });
  await new Promise(setImmediate);
  const observed = [...started];
  gates[0].release([]); gates[1].release({}); gates[2].release("CAD");
  assert.equal((await response).status, 200);
  assert.deepEqual(observed.sort(), ["currency", "fx", "history"]);
});

for (const route of ["app/api/portfolios/[id]/route.ts", "app/api/dashboard/route.ts"]) {
  test(route + " starts valuation and chart history together within the same owner", async () => {
    const items = deferred(), series = deferred(), started = [];
    const { GET } = load(route, { ...common,
      "@/db": { schema, db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: 1, userId: "alice" }] }) }) }) } },
      "@/lib/user-settings": { getUserSetting: async () => "CAD" }, "@/lib/currency": { getRates: async () => ({ date: "today" }) },
      "@/lib/portfolio": { summarize: () => ({}), valuedItems: (_id, _currency, _fx, user) => { assert.equal(user, "alice"); started.push("items"); return items.promise; }, valueSeries: (_id, _range, _currency, _fx, user) => { assert.equal(user, "alice"); started.push("series"); return series.promise; } },
    });
    const response = GET(request, { params: Promise.resolve({ id: "1" }) });
    await new Promise(setImmediate);
    const observed = [...started]; items.release([]); series.release([]);
    assert.equal((await response).status, 200);
    assert.deepEqual(observed.sort(), ["items", "series"]);
  });
}

test("empty and one-point charts avoid loading the plotting library", () => {
  const imports = [];
  const jsx = (type, props) => ({ type, props });
  const { PriceChart } = load("components/PriceChart.tsx", {
    react: { lazy: loader => ({ lazyLoader: loader }), Suspense: "Suspense" },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    recharts: new Proxy({}, { get: (_target, key) => { imports.push(key); return key; } }),
    "@/lib/format": { fmtMoney: String }, "@/lib/ui-prefs": { useHidePrices: () => false },
  }, { onRequire: name => { if (name === "recharts") imports.push(name); } });
  PriceChart({ data: [], currency: "CAD", height: 120 });
  PriceChart({ data: [{ date: "today", value: 5 }], currency: "CAD", height: 120 });
  assert.equal(imports.length, 0, "no Recharts download/initialization is needed for an empty chart");
  const populated = PriceChart({ data: [{ date: "yesterday", value: 4 }, { date: "today", value: 5 }], currency: "CAD", height: 120 });
  assert.equal(populated.type, "Suspense");
  assert.equal(populated.props.fallback.props.style.height, 120);
});
