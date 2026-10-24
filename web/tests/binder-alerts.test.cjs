/* eslint-disable @typescript-eslint/no-require-imports -- Run real alert logic against isolated data. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function harness() {
  const data = {
    cards: [{ id: "tp:1", prices: { tcgplayer: { currency: "USD", variants: { normal: { market: 100 }, holofoil: { market: 200 } } } } }],
    alerts: [{ id: 1, userId: "alice", cardId: "tp:1", variantType: "normal", direction: "either", thresholdPct: 10, basePrice: 80, baseCurrency: "USD", createdAt: "original", acknowledgedAt: null, lastTriggeredAt: null }],
  };
  const schema = Object.fromEntries(["cards", "alerts"].map(table => [table, new Proxy({ table }, { get: (_, key) => key === "table" ? table : { table, key } })]));
  const val = (x, row) => x?.table ? row[x.table]?.[x.key] : x;
  const orm = { eq: (a, b) => row => val(a, row) === val(b, row), and: (...ps) => row => ps.every(p => p(row)), sql: (strings, ...args) => ({ strings, args }) };
  function evaluate(x, existing) {
    if (!x?.strings) return x;
    assert.match(x.strings.join(""), /case when/i);
    return existing[x.args[0].key] === x.args[1] ? existing[x.args[2].key] : x.args[3];
  }
  function query(mode, table, selection) {
    const q = {
      from(t) { table = t; return q; }, innerJoin(t, on) { q.join = [t, on]; return q; },
      where(p) { q.p = p; return q; }, limit() { return q; },
      values(v) { q.v = v; return q; }, set(v) { q.v = v; return q; },
      onConflictDoUpdate(c) { q.conflict = c; return q; }, returning() { return q; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (mode === "insert") {
          const existing = data[table.table].find(r => q.conflict.target.every(c => r[c.key] === q.v[c.key]));
          if (existing) { const patch = Object.fromEntries(Object.entries(q.conflict.set).map(([k, v]) => [k, evaluate(v, existing)])); Object.assign(existing, patch); return [{ ...existing }]; }
          const row = { id: 3, ...q.v }; data[table.table].push(row); return [row];
        }
        let rows = data[table.table].map(r => ({ [table.table]: r }));
        if (q.join) rows = rows.flatMap(r => data[q.join[0].table].map(c => ({ ...r, [q.join[0].table]: c })).filter(q.join[1]));
        rows = rows.filter(q.p ?? (() => true));
        if (mode === "update") rows.forEach(r => Object.assign(r[table.table], q.v));
        if (mode === "delete") data[table.table] = data[table.table].filter(r => !rows.some(x => x[table.table] === r));
        return rows.map(r => selection ? Object.fromEntries(Object.entries(selection).map(([k, v]) => [k, r[v.table]])) : { ...r[table.table] });
      }).then(resolve, reject); },
    }; return q;
  }
  const db = { select: s => query("select", null, s), insert: t => query("insert", t), update: t => query("update", t), delete: t => query("delete", t) };
  const stubs = { "@/db": { db, schema }, "drizzle-orm": orm, "./cards": { rowToCard: r => r }, "./format": { nowIso: () => "now" }, "next/server": { NextResponse: Response }, "@/lib/auth": { requireUserId: async () => "alice" }, zod: require("zod") };
  function load(relative) {
    const file = path.resolve(__dirname, "../src", relative), exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, console, Error, require: id => stubs[id] ?? load(id.startsWith("@/") ? id.slice(2) + ".ts" : path.relative(path.resolve(__dirname, "../src"), path.resolve(path.dirname(file), id + ".ts"))) });
    return exports;
  }
  return { data, load, alerts: load("lib/alerts.ts") };
}

test("drop/rise/either use the signed change and exact threshold", async () => {
  const h = harness();
  h.data.alerts[0].basePrice = 100;
  h.data.cards[0].prices.tcgplayer.variants.normal.market = 85;
  for (const [direction, triggered] of [["drop", true], ["rise", false], ["either", true]]) {
    h.data.alerts[0].direction = direction;
    const [view] = await h.alerts.listAlerts("alice");
    assert.equal(view.direction, direction);
    assert.equal(view.changePct, -15);
    assert.equal(view.triggered, triggered);
  }
  h.data.cards[0].prices.tcgplayer.variants.normal.market = 110;
  h.data.alerts[0].direction = "rise";
  assert.equal((await h.alerts.listAlerts("alice"))[0].triggered, true);
});

test("same finish edits preserve baseline, creation, and acknowledgement", async () => {
  const h = harness(); h.data.alerts[0].acknowledgedAt = "yesterday";
  const row = await h.alerts.upsertAlert("alice", "tp:1", 20, "normal", "drop");
  assert.equal(row.basePrice, 80); assert.equal(row.baseCurrency, "USD"); assert.equal(row.createdAt, "original"); assert.equal(row.acknowledgedAt, "yesterday");
  assert.equal(row.direction, "drop"); assert.equal(row.thresholdPct, 20);
});

test("changing finish explicitly establishes that finish's baseline", async () => {
  const h = harness(); const row = await h.alerts.upsertAlert("alice", "tp:1", 10, "holofoil", "rise");
  assert.equal(row.variantType, "holofoil"); assert.equal(row.basePrice, 200); assert.equal(row.createdAt, "original");
});

test("omitted finish preserves an existing watch's finish", async () => {
  const h = harness(); h.data.alerts[0].variantType = "holofoil";
  assert.equal((await h.alerts.upsertAlert("alice", "tp:1", 25)).variantType, "holofoil");
});

test("new watches default to Either and Normal and remain account scoped", async () => {
  const h = harness(); const row = await h.alerts.upsertAlert("bob", "tp:1", 10);
  assert.equal(row.direction, "either"); assert.equal(row.variantType, "normal"); assert.equal(row.basePrice, 100);
  assert.equal((await h.alerts.listAlerts("alice")).length, 1);
  assert.equal(await h.alerts.acknowledgeAlert("bob", 1), null);
  await h.alerts.deleteAlert("bob", 1); assert.equal(h.data.alerts.length, 2);
});

test("currency mismatch cannot trigger; a matching market quote still works", async () => {
  const h = harness(); h.data.cards[0].prices.tcgplayer.currency = "EUR";
  let [view] = await h.alerts.listAlerts("alice");
  assert.equal(view.triggered, false); assert.equal(view.changePct, null); assert.equal(view.currentPrice, null);
  h.data.cards[0].prices.cardmarket = { currency: "USD", variants: { normal: { market: 100 } } };
  [view] = await h.alerts.listAlerts("alice"); assert.equal(view.currentPrice, 100); assert.equal(view.triggered, true);
});

test("missing/zero exact finish cannot arm or reset and cannot borrow holo", async () => {
  for (const missing of [undefined, 0, -1, Infinity, NaN]) {
    const h = harness(); h.data.cards[0].prices.tcgplayer.variants.normal.market = missing;
    await assert.rejects(h.alerts.upsertAlert("bob", "tp:1", 10, "normal"), /quote/i);
    await assert.rejects(h.alerts.acknowledgeAlert("alice", 1), /quote/i);
    const [view] = await h.alerts.listAlerts("alice"); assert.equal(view.currentPrice, null); assert.equal(view.triggered, false);
    assert.equal(h.data.alerts[0].basePrice, 80);
  }
});

test("explicit acknowledgement resets baseline using the saved finish", async () => {
  const h = harness(); h.data.alerts[0].variantType = "holofoil";
  const row = await h.alerts.acknowledgeAlert("alice", 1);
  assert.equal(row.basePrice, 200); assert.equal(row.acknowledgedAt, "now"); assert.equal(row.createdAt, "original");
});

test("threshold and direction validation protects internal callers", async () => {
  const h = harness();
  for (const threshold of [0, 0.49, 1001, NaN, Infinity]) await assert.rejects(h.alerts.upsertAlert("alice", "tp:1", threshold, "normal"), /threshold/i);
  await assert.rejects(h.alerts.upsertAlert("alice", "tp:1", 10, "normal", "sideways"), /direction/i);
});

test("a quote without a supported native currency cannot arm a watch", async () => {
  for (const currency of [undefined, "", "invalid"]) {
    const h = harness(); h.data.cards[0].prices.tcgplayer.currency = currency;
    await assert.rejects(h.alerts.upsertAlert("bob", "tp:1", 10), /quote/i);
  }
});

function controlHarness({ missing = false, savedVariant = "normal", failSave = false, hidePrices = false } = {}) {
  const hooks = new Map(), pending = [], requests = [];
  let active, index;
  const react = {
    useState(initial) { const slots = hooks.get(active), i = index++; if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial; return [slots[i], v => { slots[i] = typeof v === "function" ? v(slots[i]) : v; }]; },
    useRef(initial) { const slots = hooks.get(active), i = index++; return slots[i] ??= { current: initial }; },
    useId() { return "test-title"; },
    useEffect(callback, deps) { const slots = hooks.get(active), i = index++; if (!slots[i] || deps.some((v, j) => v !== slots[i][j])) { slots[i] = deps; pending.push(callback); } },
  };
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const h = harness();
  h.data.alerts[0].variantType = savedVariant;
  if (missing) h.data.cards[0].prices.tcgplayer.variants = { holofoil: { market: 200 } };
  const stubs = { react, "react/jsx-runtime": { jsx, jsxs: jsx }, "@/lib/types": h.load("lib/types.ts"), "@/lib/alert-rules": h.load("lib/alert-rules.ts"), "@/lib/format": { fmtMoney: (n, c) => `${n} ${c}` }, "@/lib/ui-prefs": { useHidePrices: () => hidePrices }, "./ui": { Button: p => jsx("button", p), Field: p => jsx("label", { children: [p.label, p.children] }), inputCls: "input" } };
  const file = path.resolve(__dirname, "../src/components/PriceAlertControl.tsx"), exports = {};
  assert.ok(fs.existsSync(file), "The shared price-alert control must exist");
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, console, fetch: async (url, options) => {
    requests.push([url, options]);
    if (url === "/api/alerts" && !options) return { ok: true, json: async () => ({ alerts: [{ ...h.data.alerts[0], card: { id: "tp:1" } }] }) };
    if (url.startsWith("/api/cards/")) return { ok: true, json: async () => ({ card: h.data.cards[0] }) };
    return { ok: !failSave, json: async () => failSave ? ({ error: "Price import unavailable" }) : ({ ...h.data.alerts[0], id: 1 }) };
  }, require: id => { if (!(id in stubs)) throw Error("Unexpected import " + id); return stubs[id]; } });
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand);
    if (!node || typeof node !== "object") return node;
    if (typeof node.type === "function") { active = node.type; index = 0; if (!hooks.has(active)) hooks.set(active, []); return expand(node.type(node.props)); }
    return { ...node, props: { ...node.props, children: expand(node.props.children) } };
  }
  const render = () => expand(jsx(exports.PriceAlertControl, { cardId: "tp:1", cardName: "Test card" }));
  const find = (node, pred) => Array.isArray(node) ? node.flatMap(n => find(n, pred)) : node && typeof node === "object" ? [...(pred(node) ? [node] : []), ...find(node.props.children, pred)] : [];
  return { requests, render, find, async effects() { while (pending.length) pending.shift()(); await new Promise(resolve => setImmediate(resolve)); } };
}

test("alert controls fetch only when opened and retain the saved finish for reset", async () => {
  const h = controlHarness(); let tree = h.render(); await h.effects(); assert.equal(h.requests.length, 0);
  h.find(tree, n => n.type === "button")[0].props.onClick(); tree = h.render(); await h.effects(); tree = h.render();
  assert.equal(h.requests.filter(([url]) => url.startsWith("/api/cards/")).length, 1);
  assert.equal(h.requests.filter(([url]) => url === "/api/alerts").length, 1);
  assert.equal(h.find(tree, n => n.type === "dialog").length, 1);
  const reset = h.find(tree, n => n.type === "button" && String(n.props.children).includes("Reset baseline"))[0];
  assert.ok(reset); await reset.props.onClick();
  assert.equal(h.requests.at(-1)[0], "/api/alerts/1"); assert.equal(h.requests.at(-1)[1].method, "POST");
});

test("an unavailable saved finish stays selectable and disables save/reset but allows removal", async () => {
  const h = controlHarness({ missing: true, savedVariant: "reverseHolofoil" });
  h.find(h.render(), n => n.type === "button")[0].props.onClick(); h.render(); await h.effects(); const tree = h.render();
  const finish = h.find(tree, n => n.type === "select")[0];
  assert.equal(finish.props.value, "reverseHolofoil");
  assert.ok(h.find(finish, n => n.type === "option" && n.props.value === "reverseHolofoil").length);
  assert.equal(h.find(tree, n => n.type === "button" && n.props.type === "submit")[0].props.disabled, true);
  assert.equal(h.find(tree, n => n.type === "button" && n.props.children === "Reset baseline")[0].props.disabled, true);
  assert.equal(h.find(tree, n => n.type === "button" && n.props.children === "Remove alert")[0].props.disabled, false);
});

test("Hide prices masks both current quotes and saved or prospective baselines", async () => {
  for (const hidePrices of [false, true]) {
    const h = controlHarness({ hidePrices });
    h.find(h.render(), n => n.type === "button")[0].props.onClick(); h.render(); await h.effects(); let tree = h.render();
    const text = () => h.find(tree, n => n.type === "p").map(n => [].concat(n.props.children).flat(Infinity).join("")).join("\n");
    if (hidePrices) {
      assert.equal(text().includes("100 USD"), false); assert.equal(text().includes("80 USD"), false);
      assert.equal((text().match(/•••/g) ?? []).length, 2);
    } else {
      assert.match(text(), /Current Normal market quote: 100 USD/); assert.match(text(), /Baseline: 80 USD/);
    }
    h.find(tree, n => n.type === "select")[0].props.onChange({ target: { value: "holofoil" } }); tree = h.render();
    if (hidePrices) { assert.equal(text().includes("200 USD"), false); assert.equal((text().match(/•••/g) ?? []).length, 2); }
    else { assert.match(text(), /Current Holofoil market quote: 200 USD/); assert.match(text(), /Baseline: 200 USD USD when saved/); }
  }
});

test("control saves the selected finish, direction, and percentage and exposes API errors", async () => {
  const h = controlHarness({ failSave: true });
  h.find(h.render(), n => n.type === "button")[0].props.onClick(); h.render(); await h.effects(); let tree = h.render();
  const [finish, direction] = h.find(tree, n => n.type === "select");
  finish.props.onChange({ target: { value: "holofoil" } }); direction.props.onChange({ target: { value: "drop" } });
  h.find(tree, n => n.type === "input")[0].props.onChange({ target: { value: "12.5" } }); tree = h.render();
  h.find(tree, n => n.type === "form")[0].props.onSubmit({ preventDefault() {} }); await h.effects(); tree = h.render();
  const [url, options] = h.requests.at(-1);
  assert.equal(url, "/api/alerts"); assert.equal(options.method, "POST");
  assert.deepEqual(JSON.parse(options.body), { cardId: "tp:1", variantType: "holofoil", direction: "drop", thresholdPct: 12.5 });
  assert.equal(h.find(tree, n => n.props.role === "alert")[0].props.children, "Price import unavailable");
});

test("alert API validates thresholds and direction and returns directional quote context", async () => {
  const h = harness(), route = h.load("app/api/alerts/route.ts");
  const post = body => route.POST({ json: async () => body });
  for (const body of [{ thresholdPct: 0 }, { thresholdPct: 1001 }, { direction: "sideways" }]) assert.equal((await post({ cardId: "tp:1", ...body })).status, 400);
  const response = await post({ cardId: "tp:1", variantType: "normal", thresholdPct: 15, direction: "drop" });
  assert.equal(response.status, 201); assert.equal((await response.json()).direction, "drop");
  const data = await (await route.GET()).json();
  assert.equal(data.alerts[0].direction, "drop"); assert.equal(data.alerts[0].basePrice, 80); assert.equal(data.alerts[0].currentPrice, 100); assert.equal(data.alerts[0].variantType, "normal");
});

test("reset API returns a readable error for unavailable saved finish", async () => {
  const h = harness(); h.data.cards[0].prices = {};
  const route = h.load("app/api/alerts/[id]/route.ts"), ctx = id => ({ params: Promise.resolve({ id }) });
  assert.equal((await route.POST({}, ctx("0"))).status, 400);
  const response = await route.POST({}, ctx("1")); assert.equal(response.status, 400); assert.match((await response.json()).error, /quote/i);
  assert.equal(h.data.alerts[0].basePrice, 80);
});
