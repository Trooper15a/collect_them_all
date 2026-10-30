/* eslint-disable @typescript-eslint/no-require-imports -- Isolate authentication and settings to verify public calculator access. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, modules) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, {
    exports, process: { env: {} }, URL, Response,
    require: (name) => { if (name in modules) return modules[name]; throw new Error(`Unexpected dependency ${name}`); },
  });
  return exports;
}

function pageHarness(userId, currency = 'CAD') {
  let settingsReads = 0;
  const page = load('app/card-show/page.tsx', {
    'react/jsx-runtime': { jsx: (type, props, key) => ({ type, props, key }) },
    'next/navigation': { redirect: (url) => { throw new Error(`Unexpected redirect: ${url}`); } },
    '@/lib/auth': { auth: async () => userId ? { user: { id: userId } } : null },
    '@/lib/currency': { getRates: async () => ({ base: 'USD', date: 'fallback', rates: { USD: 1, CAD: 1.36 } }), isCurrency: (value) => ['USD', 'CAD', 'EUR'].includes(value) },
    '@/lib/user-settings': { getUserSetting: async () => { settingsReads++; return currency; } },
    '@/components/card-show/CardShow': { CardShow: 'CardShow' },
  });
  return { render: page.default, reads: () => settingsReads };
}

test('guests can open Card Show without signing in or reading account settings', async () => {
  const h = pageHarness(null);
  const element = await h.render();
  assert.equal(element.type, 'CardShow');
  assert.equal(element.props.storageKey, 'rnp-card-show:guest');
  assert.equal(element.props.initialCurrency, 'USD');
  assert.equal(element.props.guest, true);
  assert.equal(h.reads(), 0);
});

test('signed-in drafts remain scoped to their account and use their own preferences', async () => {
  const h = pageHarness('alice:1');
  const element = await h.render();
  assert.equal(element.props.storageKey, 'rnp-card-show:alice%3A1');
  assert.equal(element.props.initialCurrency, 'CAD');
  assert.equal(element.props.guest, false);
  assert.equal(h.reads(), 1);
  assert.equal((await pageHarness('bob', 'invalid').render()).props.initialCurrency, 'USD');
});

test('only the public calculator is allowed; private account routes still require login', () => {
  const config = load('lib/auth.config.ts', { 'next-auth/providers/google': { __esModule: true, default: (options) => options } }).default;
  const allowed = (pathname) => config.callbacks.authorized({ auth: null, request: { nextUrl: new URL(`http://localhost:3000${pathname}`) } });
  assert.equal(allowed('/card-show'), true);
  assert.equal(allowed('/api/card-show/lookup'), true);
  for (const route of ['/card-show-private', '/card-show/secret', '/api/card-show/private', '/portfolios', '/settings', '/trade', '/api/portfolios']) assert.equal(allowed(route), false, route);
});
