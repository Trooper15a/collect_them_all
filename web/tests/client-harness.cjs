/* eslint-disable @typescript-eslint/no-require-imports -- Run client event handlers without a live database or camera. */
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function clientHarness(entry, { hidden = false, props = {}, exportName = "default", params = { id: "tp:test" }, extraModules = {}, query = new URLSearchParams(), fetch = async () => ({ ok: true, json: async () => ({}) }) } = {}) {
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
    "next/navigation": { useParams: () => params, useSearchParams: () => query, useRouter: () => ({ push: () => {}, replace: () => {} }) },
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
  Object.assign(modules, extraModules);
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
  const entryModule = load(path.join(__dirname, "../src", entry));
  const Page = entryModule[exportName];
  return {
    exports: entryModule,
    render: () => { cursor = 0; const tree = Page(props); return tree.type === "Suspense" ? tree.props.children.type(tree.props.children.props) : tree; },
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

module.exports = { clientHarness, nodes, text };
