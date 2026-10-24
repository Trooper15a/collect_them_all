/* eslint-disable @typescript-eslint/no-require-imports -- Run client event handlers without a live database or camera. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function clientHarness(entry, { hidden = false, fetch = async () => ({ ok: true, json: async () => ({}) }) } = {}) {
  const slots = [], effects = [];
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
    useMemo: (fn) => fn(), useCallback: (fn) => fn,
    useEffect: (fn, deps) => {
      const i = cursor++;
      if (!slots[i] || deps.some((v, n) => v !== slots[i][n])) effects.push(fn);
      slots[i] = deps;
    },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const modules = {
    react: hooks, "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "next/link": { __esModule: true, default: "a" },
    "next/navigation": { useParams: () => ({ id: "tp:test" }) },
    "next-auth/react": { useSession: () => ({ data: { user: { id: "fixture" } }, status: "authenticated" }) },
    "@/components/Scanner": { Scanner: "Scanner" },
    "@/components/AddToPortfolioSheet": { AddToPortfolioSheet: "AddToPortfolioSheet" },
    "@/components/BackLink": { BackLink: "BackLink" },
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
    render: () => { cursor = 0; return Page(); },
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
