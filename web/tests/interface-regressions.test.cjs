/* eslint-disable @typescript-eslint/no-require-imports -- Run client event handlers without a live database or camera. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function clientHarness(entry, { hidden = false, query = new URLSearchParams(), fetch = async () => ({ ok: true, json: async () => ({}) }) } = {}) {
  const slots = [], effects = [], cleanups = [];
  let cursor = 0;
  const hooks = {
    useState: (initial) => {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (value) => { slots[i] = typeof value === "function" ? value(slots[i]) : value; }];
    },
    useRef: (initial) => {
      const i = cursor++;
      return slots[i] ??= { current: initial };
    },
    useMemo: (fn) => fn(), useCallback: (fn) => fn, Suspense: "Suspense",
    useEffect: (fn, deps) => {
      const i = cursor++;
      if (!slots[i] || deps.some((v, n) => v !== slots[i][n])) effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); });
      slots[i] = deps;
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const modules = {
    react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { useParams: () => ({ id: "tp:test" }), useSearchParams: () => query, useRouter: () => ({ push: () => {} }) },
    "next-auth/react": { useSession: () => ({ data: { user: { id: "fixture" } }, status: "authenticated" }) },
    "@/components/Scanner": { Scanner: "Scanner" },
    "@/components/AddToPortfolioSheet": { AddToPortfolioSheet: "AddToPortfolioSheet" },
    "@/components/BackLink": { BackLink: "BackLink" },
    "@/components/PullToRefresh": { PullToRefresh: "PullToRefresh" },
    "@/components/SwipeToDelete": { SwipeToDelete: "SwipeToDelete" },
    "@/components/PriceChart": { PriceChart: "PriceChart" },
    "@/components/Toast": { showToast: () => {} },
    "@/lib/haptics": { haptic: () => {} },
    "@/lib/ui-prefs": { useHidePrices: () => hidden, useActiveTcgHydrated: () => ({ tcg: "all", hydrated: true }) },
    "@/lib/scanner/matcher": { isScanIndexId: () => false, scanThumbnailUrl: () => null },
  };
  function load(file) {
    const exports = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText, {
      exports, fetch, URL, URLSearchParams, setTimeout, clearTimeout, AbortController,
      require: (name) => {
        if (modules[name]) return modules[name];
        const target = name.startsWith("@/") ? path.join(__dirname, "../src", name.slice(2)) : path.resolve(path.dirname(file), name);
        return load([`${target}.ts`, `${target}.tsx`].find(fs.existsSync));
      },
    });
    return exports;
  }
  const { default: Page } = load(path.join(__dirname, "../src", entry));
  return {
    render: () => { cursor = 0; const tree = Page(); return tree.type === "Suspense" ? tree.props.children.type(tree.props.children.props) : tree; },
    flush: async () => { for (const effect of effects.splice(0)) effect(); await new Promise(setImmediate); },
  };
}

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join("");
  if (tree == null || typeof tree === "boolean") return "";
  if (typeof tree !== "object") return String(tree);
  if (typeof tree.type === "function" && tree.type.name === "Money") return text(tree.type(tree.props));
  return text(tree.props?.children);
}

test("Stand mode retains and pauses the scanner while confirming a match", async () => {
  const h = clientHarness("app/scan/page.tsx", { fetch: async () => ({ ok: true, json: async () => ({ card: { id: "tp:test", name: "Raichu", prices: {} } }) }) });
  const stand = nodes(h.render(), (n) => (n.type === "button" || n.type?.name === "Button") && text(n) === "Stand scan")[0];
  stand.props.onClick();
  const scanner = nodes(h.render(), (n) => n.type === "Scanner")[0];
  const matches = [{ card: { id: "tp:test", name: "Raichu" }, score: 0.99 }];
  scanner.props.onMatches(matches);
  const confirmation = h.render();
  const retained = nodes(confirmation, (n) => n.type === "Scanner")[0];
  assert.ok(retained, "confirming must not unmount the scanner and its scene fingerprint");
  assert.equal(retained.props.paused, true);
  await nodes(confirmation, (n) => n.type === "button" && n.props.disabled === false && text(n).includes("Raichu"))[0].props.onClick();
  assert.equal(nodes(h.render(), (n) => n.type === "Scanner")[0].props.paused, false);
});

for (const hidden of [false, true]) {
  test(`eBay listing amounts ${hidden ? "respect Hide prices" : "use the selected CAD currency"}`, async () => {
    const item = { title: "Listing", price: 10, currency: "USD", date: "", itemUrl: "https://example.test/listing" };
    const h = clientHarness("app/cards/[id]/page.tsx", { hidden, fetch: async (url) => ({ ok: true, json: async () => {
      if (url.startsWith("/api/cards/")) return { card: { id: "tp:test", name: "Raichu", tcg: "pokemon", language: "eng", prices: {} }, history: [], displayCurrency: "CAD", fx: { rates: { USD: 1, CAD: 1.4 } } };
      if (url.startsWith("/api/ebay/")) return { raw: [item], graded: [{ grade: "PSA 10", items: [item] }] };
      return {};
    } }) });
    h.render(); await h.flush(); h.render(); await h.flush();
    const listings = nodes(h.render(), (n) => n.type === "a" && n.props.href === item.itemUrl);
    assert.equal(listings.length, 2);
    for (const listing of listings) {
      assert.ok(text(listing).includes(hidden ? "•••" : "CA$14.00"), text(listing));
      assert.equal(text(listing).includes("$10.00"), false);
    }
  });
}


const copyCard = { id: "tp:test", name: "Raichu", tcg: "pokemon", language: "eng", prices: { tcgplayer: { currency: "USD", variants: { holofoil: { market: 100 }, normal: { market: 10 } } } } };
const ownedCopy = { id: 11, portfolioId: 1, portfolioName: "Favorites", variantType: "normal", condition: "LP", quantity: 3, isGraded: false, gradingCompany: null, grade: null };
const copyFx = { base: "USD", rates: { USD: 1, CAD: 1.4 } };
for (const hidden of [false, true]) {
  test(`saved Normal LP copy ${hidden ? "hides values" : "uses condition and selected currency"} with holo listed first`, async () => {
    const requests = [];
    const h = clientHarness("app/cards/[id]/page.tsx", { hidden, query: new URLSearchParams("itemId=11"), fetch: async url => {
      requests.push(url);
      return { ok: true, json: async () => url.startsWith("/api/cards/") ? { card: copyCard, item: ownedCopy, variant: "normal", history: [], displayCurrency: "CAD", fx: copyFx } : {} };
    } });
    assert.equal(text(h.render()).includes("$100.00"), false);
    await h.flush();
    const region = nodes(h.render(), n => n.props?.["aria-label"] === "Your copy")[0];
    assert.ok(region, "copy context is the primary value region");
    assert.match(text(region), /Normal.*Lightly Played/);
    assert.match(text(region), /3 copies/);
    assert.ok(text(region).includes(hidden ? "•••" : "CA$11.90"), text(region));
    if (!hidden) assert.ok(text(region).includes("CA$35.70"), text(region));
    assert.equal(text(region).includes("$140.00"), false);
    assert.ok(requests.some(url => url.startsWith("/api/cards/") && url.includes("itemId=11")));
  });
}
test("a missing saved finish never borrows the holo quote", async () => {
  const h = clientHarness("app/cards/[id]/page.tsx", { query: new URLSearchParams("itemId=11"), fetch: async url => ({ ok: true, json: async () => url.startsWith("/api/cards/") ? { card: copyCard, item: { ...ownedCopy, variantType: "reverseHolofoil" }, variant: "reverseHolofoil", history: [], fx: copyFx, displayCurrency: "CAD" } : {} }) });
  h.render(); await h.flush();
  const region = nodes(h.render(), n => n.props?.["aria-label"] === "Your copy")[0];
  assert.match(text(region), /No quote for this finish/);
  assert.equal(text(region).includes("CA$140.00"), false);
});
test("catalog finish selection clears old history and ignores slower previous requests", async () => {
  const requests = [], pending = [];
  const h = clientHarness("app/cards/[id]/page.tsx", { fetch: async url => {
    if (!url.startsWith("/api/cards/")) return { ok: true, json: async () => ({ raw: [], graded: [] }) };
    requests.push(url);
    if (requests.length === 1) return { ok: true, json: async () => ({ card: copyCard, variant: "normal", history: [{ date: "2026-10-23", tcgplayerMarket: 10 }], fx: copyFx, displayCurrency: "CAD" }) };
    return new Promise(resolve => pending.push(data => resolve({ ok: true, json: async () => data })));
  } });
  h.render(); await h.flush();
  let tree = h.render();
  const selector = nodes(tree, n => n.type === "select" && n.props["aria-label"] === "Finish")[0];
  assert.ok(selector);
  assert.equal(selector.props.value, "normal");
  selector.props.onChange({ target: { value: "holofoil" } });
  assert.equal(nodes(h.render(), n => n.type === "PriceChart")[0].props.data.length, 0);
  nodes(h.render(), n => n.type === "select" && n.props["aria-label"] === "Finish")[0].props.onChange({ target: { value: "normal" } });
  assert.ok(requests[1].includes("variant=holofoil"));
  assert.ok(requests[2].includes("variant=normal"));
  pending[1]({ card: copyCard, variant: "normal", history: [{ date: "2026-10-23", tcgplayerMarket: 10 }], fx: copyFx, displayCurrency: "CAD" });
  await new Promise(setImmediate);
  pending[0]({ card: copyCard, variant: "holofoil", history: [{ date: "2026-10-23", tcgplayerMarket: 100 }], fx: copyFx, displayCurrency: "CAD" });
  await new Promise(setImmediate);
  tree = h.render();
  assert.equal(nodes(tree, n => n.type === "select" && n.props["aria-label"] === "Finish")[0].props.value, "normal");
  assert.equal(nodes(tree, n => n.type === "PriceChart")[0].props.data[0].value, 14);
});


test("graded saved copy uses a raw quote once for graded references", async () => {
  const h = clientHarness("app/cards/[id]/page.tsx", { query: new URLSearchParams("itemId=11"), fetch: async url => ({ ok: true, json: async () => url.startsWith("/api/cards/") ? { card: copyCard, item: { ...ownedCopy, isGraded: true, gradingCompany: "PSA", grade: "10" }, variant: "normal", history: [], fx: copyFx, displayCurrency: "CAD" } : {} }) });
  h.render(); await h.flush();
  let tree = h.render();
  assert.match(text(nodes(tree, n => n.props?.["aria-label"] === "Your copy")[0]), /CA\$42.00/);
  nodes(tree, n => n.type?.name === "Segmented" && n.props.value === "raw")[0].props.onChange("graded");
  tree = h.render();
  const psa = nodes(tree, n => n.type === "div" && n.props.children?.[0]?.props?.children === "PSA 10")[0];
  assert.ok(text(psa).includes("CA$42.00"), text(psa));
  assert.equal(text(psa).includes("CA$126.00"), false);
});
test("switching from a catalog card into saved context hides the old quote while loading", async () => {
  const query = new URLSearchParams();
  let finishLoad;
  const h = clientHarness("app/cards/[id]/page.tsx", { query, fetch: async url => {
    if (!url.startsWith("/api/cards/")) return { ok: true, json: async () => ({ raw: [], graded: [] }) };
    if (!url.includes("itemId=")) return { ok: true, json: async () => ({ card: copyCard, variant: "holofoil", history: [], fx: copyFx, displayCurrency: "CAD" }) };
    return new Promise(resolve => { finishLoad = () => resolve({ ok: true, json: async () => ({ card: copyCard, item: ownedCopy, variant: "normal", history: [], fx: copyFx, displayCurrency: "CAD" }) }); });
  } });
  h.render(); await h.flush();
  assert.ok(text(h.render()).includes("CA$140.00"));
  query.set("itemId", "11");
  assert.equal(text(h.render()).includes("CA$140.00"), false);
  await h.flush();
  assert.equal(text(h.render()).includes("CA$140.00"), false);
  finishLoad(); await new Promise(setImmediate);
  assert.match(text(nodes(h.render(), n => n.props?.["aria-label"] === "Your copy")[0]), /CA\$11.90/);
});
test("binder card links retain saved item identity and show saved finish", async () => {
  const h = clientHarness("app/portfolios/[id]/page.tsx", { fetch: async () => ({ ok: true, json: async () => ({ portfolio: { id: 1, name: "Favorites" }, items: [{ ...ownedCopy, card: copyCard, value: 35.7, unitPrice: { amount: 8.5, currency: "USD", variant: "normal" } }], summary: { value: 35.7, cost: 0, gain: 0, gainPct: 0, itemCount: 3, change24h: 0, change24hPct: 0 }, series: [], currency: "CAD" }) }) });
  h.render(); await h.flush();
  const tree = h.render();
  const link = nodes(tree, n => n.type === "a" && n.props.href === "/cards/tp%3Atest?itemId=11")[0];
  assert.ok(link);
  assert.match(link.props["aria-label"], /Raichu.*Normal.*LP/);
  assert.match(text(tree), /Normal.*LP/);
  assert.match(text(tree), /3 copies.*total estimate/);
});
