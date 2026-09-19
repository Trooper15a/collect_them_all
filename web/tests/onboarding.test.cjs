const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relative, overrides = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const source = fs.readFileSync(filename, "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => {
    if (id in overrides) return overrides[id];
    if (id === "drizzle-orm") return { eq: (left, right) => ({ left, right }), sql: () => "count" };
    return require(id);
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { console, Request, Response }, { filename })(localRequire, module, module.exports);
  return module.exports;
}

function onboardingModule() {
  const chain = {
    from() { return this; },
    innerJoin() { return this; },
    where() { return Promise.resolve([{ n: 0 }]); },
  };
  return load("src/lib/onboarding.ts", {
    "@/db": {
      db: { select: () => chain },
      schema: {
        portfolioItems: { portfolioId: "portfolio_id" },
        portfolios: { id: "id", userId: "user_id" },
      },
    },
    "@/lib/user-settings": {
      getUserSetting: async (_key, fallback) => fallback,
      setUserSetting: async () => undefined,
    },
  });
}

test("onboarding eligibility is limited to pending collectors with no items", () => {
  const { shouldStartOnboarding } = onboardingModule();
  assert.equal(shouldStartOnboarding("pending", 0), true);
  assert.equal(shouldStartOnboarding("dismissed", 0), false);
  assert.equal(shouldStartOnboarding("completed", 0), false);
  assert.equal(shouldStartOnboarding("pending", 1), false);
});

test("milestone presentation follows count and dismissal state", () => {
  const { milestoneView } = onboardingModule();
  assert.equal(milestoneView(0, "active"), null);
  assert.equal(milestoneView(1, "active"), "progress");
  assert.equal(milestoneView(4, "active"), "progress");
  assert.equal(milestoneView(5, "active"), "sets");
  assert.equal(milestoneView(3, "dismissed"), null);
  assert.equal(milestoneView(7, "opened"), null);
});

function onboardingRoute(userId = "alice") {
  const status = {
    state: "pending",
    milestoneState: "active",
    itemCount: 0,
    eligible: true,
  };
  const service = {
    getOnboardingStatus: async (requestedUserId) => {
      assert.equal(requestedUserId, userId);
      return { ...status };
    },
    setOnboardingState: async (state) => {
      status.state = state;
      status.eligible = state === "pending" && status.itemCount === 0;
    },
    setMilestoneState: async (milestoneState) => {
      status.milestoneState = milestoneState;
    },
  };
  const route = load("src/app/api/onboarding/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/auth": {
      requireUserId: async () => {
        if (!userId) throw new Error("Unauthorized");
        return userId;
      },
    },
    "@/lib/onboarding": service,
  });
  const request = (body) => new Request("https://example.test/api/onboarding", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { ...route, request };
}

test("onboarding API rejects anonymous reads and writes", async () => {
  const anonymous = onboardingRoute(null);
  assert.equal((await anonymous.GET()).status, 401);
  assert.equal((await anonymous.PATCH(anonymous.request({ state: "dismissed" }))).status, 401);
});

test("onboarding API returns current account status and accepts bounded patches", async () => {
  const alice = onboardingRoute();
  assert.deepEqual(
    JSON.parse(JSON.stringify(await (await alice.GET()).json())),
    { state: "pending", milestoneState: "active", itemCount: 0, eligible: true },
  );
  assert.equal((await alice.PATCH(alice.request({ state: "dismissed" }))).status, 200);
  assert.equal((await alice.PATCH(alice.request({ state: "invalid" }))).status, 400);
  assert.equal((await alice.PATCH(alice.request({ milestoneState: "opened" }))).status, 200);
  assert.equal((await alice.PATCH(alice.request({}))).status, 400);
});

function readText(relative) {
  return fs.readFileSync(path.resolve(__dirname, "..", relative), "utf8");
}

test("onboarding is protected and hidden from the normal shell", () => {
  assert.match(readText("src/middleware.ts"), /"\/onboarding\/:path\*"/);
  for (const file of ["TabBar.tsx", "TcgPicker.tsx", "PwaRegister.tsx"]) {
    assert.match(readText("src/components/" + file), /\/onboarding/);
  }
});

test("add sheet reports the created item and binder destination", () => {
  const source = readText("src/components/AddToPortfolioSheet.tsx");
  assert.match(source, /export interface AddedPortfolioItem/);
  assert.match(source, /onAdded\?: \(result: AddedPortfolioItem\) => void/);
  assert.match(source, /portfolioName: selectedPortfolioName/);
});

test("card discovery keeps relevance order and supports price sorting", () => {
  const { sortDiscoveryResults } = load("src/components/CardDiscovery.tsx", {
    "@/components/Scanner": { Scanner: () => null },
    "@/components/ui": { Button: () => null, CardImage: () => null, Empty: () => null, Money: () => null, Segmented: () => null, Skeleton: () => null, TcgBadge: () => null, inputCls: "" },
    "@/lib/haptics": { haptic: () => undefined },
    "@/lib/scanner/matcher": { isScanIndexId: () => false },
    "@/lib/types": { TCGS: [] },
    "@/lib/ui-prefs": { useActiveTcgHydrated: () => ({ tcg: "all", hydrated: true }) },
    "@/components/AddToPortfolioSheet": {},
  });
  const cards = [{ id: "a", name: "A", display: { amount: 2 } }, { id: "b", name: "B", display: { amount: 5 } }];
  assert.deepEqual(Array.from(sortDiscoveryResults(cards, "relevance"), (card) => card.id), ["a", "b"]);
  assert.deepEqual(Array.from(sortDiscoveryResults(cards, "price-desc"), (card) => card.id), ["b", "a"]);
});

test("wizard composes shared discovery and add flow", () => {
  const source = readText("src/app/onboarding/page.tsx");
  assert.match(source, /CardDiscovery/);
  assert.match(source, /AddToPortfolioSheet/);
  assert.match(source, /Skip for now/);
  assert.match(source, /Choose your game/);
  assert.match(source, /Add your first card/);
  assert.match(source, /View my binder/);
});

test("dashboard and settings expose first-binder guidance", () => {
  assert.match(readText("src/app/page.tsx"), /FirstBinderMilestone/);
  const milestone = readText("src/components/FirstBinderMilestone.tsx");
  assert.match(milestone, /Build your first binder/);
  assert.match(milestone, /Your binder is taking shape/);
  assert.match(readText("src/app/settings/page.tsx"), /restartIntroduction/);
});
