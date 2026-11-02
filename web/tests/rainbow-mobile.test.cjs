/* eslint-disable @typescript-eslint/no-require-imports -- Exercise real component behavior with the project's Node hook harness pattern. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness(route = '/', queue = [], component = 'TabBar') {
  const preparations = [];
  const slots = [], effects = [];
  let cursor = 0;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(effect, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i][n])) effects.push(effect); slots[i] = deps; },
  };
  const jsx = (type, props, key) => ({ type, props, key });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components', component + '.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, {
    exports, setInterval: () => 1, clearInterval: () => {},
    localStorage: { getItem: () => JSON.stringify(queue) },
    document: { documentElement: { classList: { toggle() {}, remove() {} } }, body: { style: {} } },
    window: { addEventListener() {}, removeEventListener() {} },
    require(name) {
      if (name === 'react') return hooks;
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' };
      if (name === 'next/link') return { __esModule: true, default: 'a' };
      if (name === 'next/navigation') return { usePathname: () => route };
      if (name === '@/lib/scanner/preparation') return { prepareScanEngine: (tcg) => { preparations.push(tcg); return Promise.resolve(); } };
      if (name === '@/lib/ui-prefs') return { getActiveTcg: () => 'pokemon' };
      if (name === './TcgPicker') return { TcgPicker: 'TcgPicker' };
      throw new Error('Unexpected dependency: ' + name);
    },
  });
  return { preparations, render() { cursor = 0; return exports[component](); }, flush() { effects.splice(0).forEach(effect => effect()); } };
}
function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap(node => nodes(node, predicate));
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree === 'object' ? text(tree.props?.children) : String(tree);
}
function primary(tree) { return nodes(tree, n => n.type === 'nav' && n.props['aria-label'] === 'Primary')[0]; }

test('five primary destinations retain direct access to collection and scanner', () => {
  const tree = harness().render();
  const nav = primary(tree);
  assert.deepEqual(nodes(nav, n => n.type === 'a').map(n => n.props.href), ['/', '/portfolios', '/scan', '/sets']);
  assert.equal(nodes(nav, n => n.type === 'button' && text(n) === 'More').length, 1);
});

test('More retains every secondary tool as a real navigation link', () => {
  const tree = harness().render();
  const dialog = nodes(tree, n => n.type === 'dialog' && n.props['aria-label'] === 'More tools')[0];
  assert.ok(dialog, 'secondary tools must be in an accessible dialog');
  for (const href of ['/card-show', '/investing', '/shop', '/grade', '/wishlist', '/opens', '/settings']) {
    assert.ok(nodes(dialog, n => n.type === 'a' && n.props.href === href).length, href);
  }
});

test('More opens and closes without changing the current route', () => {
  const h = harness('/card-show');
  let tree = h.render();
  const more = () => nodes(primary(tree), n => n.type === 'button' && text(n) === 'More')[0];
  assert.equal(more().props['aria-expanded'], false);
  more().props.onClick(); tree = h.render();
  assert.equal(more().props['aria-expanded'], true);
  nodes(tree, n => n.type === 'button' && n.props['aria-label'] === 'Close more tools')[0].props.onClick(); tree = h.render();
  assert.equal(more().props['aria-expanded'], false);
});

for (const route of ['/card-show', '/investing', '/shop', '/grade', '/wishlist', '/opens/4', '/settings']) {
  test(`secondary route ${route} highlights More`, () => {
    const more = nodes(primary(harness(route).render()), n => n.type === 'button' && text(n) === 'More')[0];
    assert.equal(more.props['aria-current'], 'page');
  });
}

for (const route of ['/sets/pokemon:151', '/cards', '/cards/tp:123']) {
  test(`lookup route ${route} keeps Lookup selected`, () => {
    const lookup = nodes(primary(harness(route).render()), n => n.type === 'a' && n.props.href === '/sets')[0];
    assert.equal(lookup.props['aria-current'], 'page');
  });
}

test('scan queue count survives the navigation regrouping', () => {
  const h = harness('/scan', [{ id: 'tp:one' }, { id: 'tp:two' }]);
  h.render(); h.flush();
  const scan = nodes(primary(h.render()), n => n.type === 'a' && n.props.href === '/scan')[0];
  assert.ok(text(scan).includes('2'));
});

for (const route of ['/landing', '/login', '/privacy', '/terms', '/faq', '/auth/error', '/onboarding']) {
  test(`public page ${route} has no app navigation`, () => assert.equal(harness(route).render(), null));
  test(`public page ${route} has no app header`, () => assert.equal(harness(route, [], 'AppHeader').render(), null));
}

test('scanner navigation still prepares the selected game before opening', () => {
  const h = harness('/');
  const scan = nodes(primary(h.render()), n => n.type === 'a' && n.props.href === '/scan')[0];
  scan.props.onFocus();
  scan.props.onPointerEnter();
  assert.deepEqual(h.preparations, ['pokemon', 'pokemon']);
});

function appearanceHarness(initial = {}) {
  const stored = new Map(Object.entries(initial));
  const attributes = new Map();
  const source = fs.readFileSync(path.join(__dirname, '../src/app/settings/page.tsx'), 'utf8');
  const helpers = source.slice(source.indexOf('function applyAppearance('), source.indexOf('/** Every settings section'));
  const exports = {};
  vm.runInNewContext(ts.transpileModule(helpers.replace('function applyAppearance(', 'export function applyAppearance(').replace('function readAppearance(', 'export function readAppearance('), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports,
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    document: { documentElement: { setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) } },
  });
  return { ...exports, attributes, stored };
}

test('the approved graphite appearance is the default and can be restored after other themes', () => {
  const h = appearanceHarness();
  assert.equal(h.readAppearance(), 'graphite');
  h.applyAppearance('light');
  assert.equal(h.readAppearance(), 'light');
  h.applyAppearance('graphite');
  assert.equal(h.readAppearance(), 'graphite');
  assert.equal(h.attributes.has('data-theme'), false);
  assert.equal(h.attributes.has('data-bg'), false);
});

test('saved OLED black and midnight choices keep their original surfaces', () => {
  for (const value of ['black', 'midnight']) {
    const h = appearanceHarness({ bgColor: value });
    assert.equal(h.readAppearance(), value);
    h.applyAppearance(value);
    assert.equal(h.attributes.get('data-bg'), value);
  }
});
