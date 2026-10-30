/* eslint-disable @typescript-eslint/no-require-imports -- Browser fixture bundles the real client components without database/auth dependencies. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
let chromium;
try { ({ chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')); } catch { /* optional browser dependency */ }

function bundleClient() {
  const modules = new Map();
  const root = path.resolve(__dirname, '..');
  const virtual = {
    '@/lib/scanner/preparation': 'exports.prepareScanEngine = async () => {};',
    '@/lib/scanner/engine': `exports.getScanEngine = async () => window.__photoScanError ? { status:'error', error:'Scanner test unavailable' } : { status:'ready', match: async () => [{ card:{id:'tp:fixture',name:'Charizard',setName:'Base Set',num:'4',tcg:'pokemon',lang:'eng'},score:0.98 }] };`,
    '@/components/Scanner': `exports.Scanner = function Scanner({onMatches,onClose,paused}) {const React=require('react');return paused?null:React.createElement('div',null,React.createElement('button',{onClick:()=>onMatches([{card:{id:'tp:fixture',name:'Charizard',setName:'Base Set',num:'4',tcg:'pokemon',lang:'eng'},score:0.98}])},'Identify sample card'),React.createElement('button',{onClick:onClose},'Close camera'));};`,
    'next/navigation': "exports.usePathname = () => '/card-show';",
    'next/link': "exports.__esModule = true; exports.default = function Link(props) { return require('react').createElement('a', props); };",
    entry: `const React = require('react');
      const {createRoot} = require('react-dom/client');
      const {CardShow} = require('@/components/card-show/CardShow');
      const {TabBar} = require('@/components/TabBar');
      createRoot(document.getElementById('root')).render(React.createElement(React.Fragment, null,
        React.createElement('main', {className:'max-w-3xl mx-auto px-4 safe-bottom'}, React.createElement(CardShow, {
          storageKey:'rnp-card-show:fixture', initialCurrency:'USD',
          fx:{base:'USD', date:'2026-10-30', rates:{USD:1,CAD:1.4,EUR:0.9,GBP:0.8,JPY:150,AUD:1.5}}
        })), React.createElement(TabBar)));`,
  };
  function visit(filename) {
    if (modules.has(filename)) return modules.get(filename).id;
    const item = { id: modules.size, source: '', deps: {} };
    modules.set(filename, item);
    let source = virtual[filename] ?? fs.readFileSync(filename, 'utf8');
    if (/\.tsx?$/.test(filename)) source = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    item.source = source;
    for (const match of source.matchAll(/require\(["']([^"']+)["']\)/g)) {
      const name = match[1];
      let resolved;
      if (name in virtual) resolved = name;
      else if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? path.join(root, 'src', name.slice(2)) : path.resolve(path.dirname(filename), name);
        resolved = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.cjs`].find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      } else resolved = require.resolve(name, { paths: [filename === 'entry' || filename in virtual ? root : path.dirname(filename)] });
      if (!resolved) throw new Error(`Cannot bundle ${name} from ${filename}`);
      item.deps[name] = visit(resolved);
    }
    return item.id;
  }
  const entry = visit('entry');
  return `(function(){const process={env:{NODE_ENV:'development'}};const modules={${[...modules.values()].map((m) => `${m.id}:[function(require,module,exports){\n${m.source}\n},${JSON.stringify(m.deps)}]`).join(',')}};const cache={};function load(id){if(cache[id])return cache[id].exports;const module=cache[id]={exports:{}};const [fn,deps]=modules[id];fn(name=>load(deps[name]),module,module.exports);return module.exports;}load(${entry});})();`;
}

test('Card Show works on a phone: cash targets, mixed-currency trades, search, saved drafts and reset', { skip: !chromium && 'Set PLAYWRIGHT_MODULE or install Playwright', timeout: 90000 }, async () => {
  const root = path.resolve(__dirname, '..');
  const bundle = bundleClient();
  const css = await require('postcss')([require('@tailwindcss/postcss')({ base: root })]).process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') });
  const card = { id: 'tp:fixture', name: 'Charizard', setName: 'Base Set', cardNumber: '4', tcg: 'pokemon', language: 'eng', price: { amount: 100, currency: 'USD', variant: 'holofoil' }, prices: { tcgplayer: { currency: 'USD', updatedAt: '2026-10-29T00:00:00Z', variants: { holofoil: { market: 100 }, reverseHolofoil: { market: 50 } } } } };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/client.js') { res.setHeader('Content-Type', 'application/javascript; charset=utf-8'); res.end(bundle); }
    else if (url.pathname === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); }
    else if (url.pathname === '/api/search') {
      const query = url.searchParams.get('q');
      res.setHeader('Content-Type', 'application/json');
      if (query === 'fail') { res.statusCode = 500; res.end('{}'); }
      else res.end(JSON.stringify({ cards: query === 'missing' ? [] : [card] }));
    } else if (url.pathname === '/api/card-show/lookup') {
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ card, warning: 'Using a saved catalog price.' }));
    } else if (url.pathname.startsWith('/api/')) { res.statusCode = 404; res.end(); }
    else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/client.js"></script></body></html>'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/card-show`);
    await page.getByRole('heading', { name: 'Card Show', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Take a picture', exact: true }).count(), 1);
    assert.equal(await page.getByRole('link', { name: 'Card Show' }).getAttribute('aria-current'), 'page');
    await page.getByRole('button', { name: '+ Add manual / graded card', exact: true }).click();
    await page.getByRole('textbox', { name: 'Card name / grade' }).fill('Charizard PSA 10');
    await page.getByRole('textbox', { name: 'Unit market value (USD)' }).fill('100');
    await page.getByRole('textbox', { name: 'Seller asking (USD)' }).fill('75');
    await page.getByText('75.0%', { exact: true }).waitFor();
    await page.getByText('At or below your buy target', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Increase Charizard PSA 10 quantity' }).click();
    await page.getByText('37.5%', { exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Deal currency' }).selectOption('CAD');
    assert.equal(await page.getByRole('textbox', { name: 'Seller asking (CAD)' }).inputValue(), '105.00');
    await page.reload();
    await page.getByText('37.5%', { exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Seller asking (CAD)' }).inputValue(), '105.00');

    await page.getByRole('button', { name: 'Selling', exact: true }).click();
    await page.getByRole('button', { name: '+ Add manual / graded card', exact: true }).click();
    await page.getByRole('textbox', { name: 'Unit market value (CAD)' }).fill('100');
    await page.getByRole('textbox', { name: 'Buyer offering (CAD)' }).fill('65');
    await page.getByText('65.0%', { exact: true }).waitFor();
    await page.getByText('Below your sell target', { exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Buyer offering (CAD)' }).fill('90');
    await page.getByText('At or above your sell target', { exact: true }).waitFor();

    await page.getByRole('button', { name: 'Trading', exact: true }).click();
    const give = page.getByRole('region', { name: 'You give', exact: true });
    const get = page.getByRole('region', { name: 'You get', exact: true });
    await give.getByRole('button', { name: '+ Add manual / graded card', exact: true }).click();
    await give.getByRole('textbox', { name: 'Unit market value (CAD)' }).fill('100');
    await get.getByRole('button', { name: '+ Add manual / graded card', exact: true }).click();
    await get.getByRole('textbox', { name: 'Unit market value (CAD)' }).fill('80');
    await page.getByRole('heading', { name: 'You’re behind', exact: true }).waitFor();
    await give.getByRole('textbox', { name: 'Cards valued at (%)' }).fill('80');
    await page.getByRole('heading', { name: 'Roughly even', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'You’re behind', exact: true }).count(), 1);
    await get.getByRole('textbox', { name: 'Cash added (CAD)' }).fill('20');
    assert.equal(await page.getByRole('heading', { name: 'You’re behind', exact: true }).count(), 0);
    await get.getByRole('textbox', { name: 'Unit market value (CAD)' }).fill('');
    assert.equal(await page.getByRole('heading', { name: 'Roughly even', exact: true }).count(), 0);
    await get.getByRole('textbox', { name: 'Unit market value (CAD)' }).fill('80');
    await page.getByRole('button', { name: 'New deal', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Unit market value (CAD)' }).count(), 0);
    await page.getByRole('button', { name: 'Undo reset', exact: true }).click();
    assert.equal(await page.getByRole('textbox', { name: 'Unit market value (CAD)' }).count(), 2);

    await page.getByRole('button', { name: 'Buying', exact: true }).click();
    const search = page.getByRole('combobox', { name: 'Search cards for cards you’re buying' });
    await search.fill('fail');
    await page.getByText('Search unavailable.', { exact: false }).waitFor();
    await search.fill('missing');
    await page.getByText('No cards found.', { exact: false }).waitFor();
    await search.fill('Charizard');
    await page.getByRole('listbox', { name: 'Matching cards' }).getByRole('option').first().click();
    await page.getByRole('combobox', { name: 'Price reference / variant' }).selectOption('1');
    assert.equal(await page.getByRole('textbox', { name: 'Unit market value (USD)' }).last().inputValue(), '50.00');
    await page.getByText('Updated: 2026-10-29.', { exact: false }).waitFor();

    // The browser decodes an actual PNG; only model inference and catalog I/O use fixtures.
    const photo = { name: 'card.png', mimeType: 'image/png', buffer: await page.getByRole('heading', { name: 'Card Show', exact: true }).screenshot() };
    await page.getByLabel('Upload card photo', { exact: true }).setInputFiles(photo);
    let picker = page.getByRole('dialog', { name: 'Add a card from a photo' });
    await picker.getByRole('button', { name: /Charizard/ }).click();
    await page.getByText('Using a saved catalog price.', { exact: true }).waitFor();
    assert.equal(await picker.count(), 0);
    assert.equal(await page.getByRole('textbox', { name: 'Unit market value (USD)' }).last().inputValue(), '100.00');

    await page.getByRole('button', { name: 'Selling', exact: true }).click();
    await page.getByRole('button', { name: 'Take a picture', exact: true }).click();
    picker = page.getByRole('dialog', { name: 'Add a card from a photo' });
    await picker.getByRole('button', { name: 'Identify sample card' }).click();
    await picker.getByRole('button', { name: /Charizard/ }).click();
    await picker.waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('textbox', { name: 'Unit market value (USD)' }).inputValue(), '100.00');
    await page.getByRole('button', { name: 'Trading', exact: true }).click();
    const giveBefore = await give.getByRole('article').count(), getBefore = await get.getByRole('article').count();
    await get.getByRole('button', { name: 'Take a picture', exact: true }).click();
    picker = page.getByRole('dialog', { name: 'Add a card from a photo' });
    await picker.getByRole('button', { name: 'Identify sample card' }).click();
    await picker.getByRole('button', { name: /Charizard/ }).click();
    await picker.waitFor({ state: 'detached' });
    assert.equal(await give.getByRole('article').count(), giveBefore);
    assert.equal(await get.getByRole('article').count(), getBefore + 1);
    await give.getByRole('button', { name: 'Take a picture', exact: true }).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('dialog', { name: 'Add a card from a photo' }).count(), 0);
    assert.equal(await give.getByRole('article').count(), giveBefore);
    await page.getByRole('button', { name: 'Buying', exact: true }).click();
    await page.evaluate(() => { window.__photoScanError = true; });
    await page.getByLabel('Upload card photo', { exact: true }).setInputFiles(photo);
    picker = page.getByRole('dialog', { name: 'Add a card from a photo' });
    await picker.getByRole('alert').filter({ hasText: 'Scanner test unavailable' }).waitFor();
    await picker.getByRole('button', { name: 'Close photo scanner', exact: true }).click();
    await page.evaluate(() => { window.__photoScanError = false; });

    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No horizontal overflow at ${width}px`);
      assert.equal(await page.getByRole('navigation', { name: 'Primary' }).getByRole('link').count(), 7);
      for (const link of await page.getByRole('navigation', { name: 'Primary' }).getByRole('link').all()) {
        assert.equal(await link.isVisible(), true);
        const bounds = await link.boundingBox();
        assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, `Tab fits at ${width}px`);
      }
    }
    if (process.env.CARD_SHOW_SCREENSHOT) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: process.env.CARD_SHOW_SCREENSHOT, fullPage: true });
    }
    assert.deepEqual(errors, []);
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
