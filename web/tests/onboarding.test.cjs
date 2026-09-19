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
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  const localRequire = (id) => {
    if (id in overrides) return overrides[id];
    if (id === "drizzle-orm") return { eq: (left, right) => ({ left, right }), sql: () => "count" };
    return require(id);
  };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, { console }, { filename })(localRequire, module, module.exports);
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
