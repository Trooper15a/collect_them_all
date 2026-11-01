/* eslint-disable @typescript-eslint/no-require-imports -- Browser fixture runs the real app components with deterministic catalog responses. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const ts = require('typescript');
let puppeteer;
try { puppeteer = require(process.env.PUPPETEER_MODULE || 'puppeteer-core'); } catch { /* Browser tooling is optional in CI. */ }
const root = path.resolve(__dirname, '..');
function pure(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root, 'src/lib', file + '.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Date, require: (name) => dependencies[name] });
  return exports;
}

test('mobile market discovery, exact-card offer checks and card/set lookup work together', { skip: !puppeteer && 'Set PUPPETEER_MODULE to the local browser tooling', timeout: 120000 }, async () => {
  const cash = pure('card-show');
  const { analyzeMarket, screenMarket } = pure('investing', { './card-show': cash });
  const now = Date.now();
  const day = (days) => new Date(now - days * 86400000).toISOString().slice(0, 10);
  const fx = { base: 'USD', date: day(0), rates: { USD: 1, CAD: 1.4, EUR: 0.9 } };
  const cards = [['steady', 'Charizard', 105], ['spike', 'Pikachu', 130], ['fall', 'Blastoise', 80]].map(([id, name, amount]) => ({
    id: `tp:${id}`, tcg: 'pokemon', name, setName: '151', cardNumber: '25', language: 'eng',
    prices: { tcgplayer: { currency: 'USD', updatedAt: new Date(now).toISOString(), variants: { normal: { market: amount } } } },
    price: { amount, currency: 'USD', variant: 'normal' }, display: { amount, currency: 'USD' },
  }));
  const history = [7, 30, 35, 40, 45].map((days) => ({ date: day(days), variantType: 'normal', tcgplayerMarket: 100, cardmarketAvg: null }));
  const entries = cards.map((card) => ({ ...card, key: card.id + ':tcgplayer:normal', imageUrl: null,
    analysis: analyzeMarket({ source: 'tcgplayer', variant: 'normal', amount: card.price.amount, currency: 'USD', updatedAt: new Date(now).toISOString(), metric: 'market' }, history, now) }));
  const virtual = {
    'next/link': `import React from 'react'; export default function Link(props) { return React.createElement('a', props); }`,
    'next/navigation': `export const usePathname = () => window.location.pathname;`,
    '@/components/Scanner': `export function Scanner(){return null;}`,
    '@/lib/scanner/engine': `export async function getScanEngine(){return {status:'error',error:'Camera is not part of this fixture'};}`,
  };
  const build = await require('esbuild').build({
    absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' },
    stdin: { resolveDir: root, loader: 'tsx', contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {Investing} from '@/components/investing/Investing'; import {CardShow} from '@/components/card-show/CardShow';
      import {CardLookup} from '@/components/CardLookup'; import SetsPage from '@/app/sets/page'; import {TabBar} from '@/components/TabBar';
      const path=location.pathname; const Component=path==='/card-show'? <CardShow storageKey="rnp-card-show:fixture-investing" initialCurrency="USD" fx={${JSON.stringify(fx)}}/> : path==='/cards'? <CardLookup/> : path==='/sets'? <SetsPage/> : <Investing/>;
      createRoot(document.getElementById('root')).render(<><main className="max-w-3xl mx-auto px-4 safe-bottom">{Component}</main><TabBar/></>);` },
    plugins: [{ name: 'fixture', setup(build) {
      build.onResolve({ filter: /^(next\/link|next\/navigation|@\/components\/Scanner|@\/lib\/scanner\/engine)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: virtual[args.path], loader: 'jsx', resolveDir: root }));
    } }],
  });
  const css = await require('postcss')([require('@tailwindcss/postcss')({ base: root })]).process(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8'), { from: path.join(root, 'src/app/globals.css') });
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const json = (data, status = 200) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
    if (url.pathname === '/client.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(build.outputFiles[0].text); }
    else if (url.pathname === '/style.css') { res.setHeader('Content-Type', 'text/css'); res.end(css.css); }
    else if (url.pathname === '/api/investing') {
      requests.push(url.searchParams.toString());
      const selected = entries.filter((entry) => (!url.searchParams.get('q') || entry.name.toLowerCase().includes(url.searchParams.get('q').toLowerCase())) && entry.price.amount >= Number(url.searchParams.get('min') || 0) && (!url.searchParams.get('max') || entry.price.amount <= Number(url.searchParams.get('max'))));
      const lists = screenMarket(selected, Number(url.searchParams.get('days') || 7));
      json({ lists, counts: Object.fromEntries(Object.entries(lists).map(([key, value]) => [key, value.length])), catalogCount: entries.length, filteredCount: selected.length, comparableCount: selected.length, fx, asOf: new Date(now).toISOString() });
    } else if (url.pathname === '/api/investing/card') {
      const index = cards.findIndex((card) => card.id === url.searchParams.get('id'));
      if (index < 0) json({ error: 'Card not found' }, 404);
      else json({ card: cards[index], history, analyses: [entries[index].analysis] });
    } else if (url.pathname === '/api/card-show/lookup') json({ card: cards.find((card) => card.id === url.searchParams.get('id')) });
    else if (url.pathname === '/api/search') {
      const query = (url.searchParams.get('q') || '').toLowerCase();
      if (query === 'fail') json({ error: 'Unavailable' }, 503);
      else json({ cards: cards.filter((card) => card.name.toLowerCase().includes(query) || card.setName.includes(query)), warnings: [] });
    } else if (url.pathname === '/api/sets') json({ sets: [{ id: 'pokemon:151:eng', tcg: 'pokemon', name: '151', code: '151', language: 'eng', total: 165, releaseDate: '2023-09-22' }], owned: {} });
    else if (url.pathname.startsWith('/api/images') || url.pathname.startsWith('/api/set')) { res.statusCode = 404; res.end(); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/client.js"></script></body></html>'); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.PUPPETEER_EXECUTABLE || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844 });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    const waitText = (text) => page.waitForFunction((value) => document.body.innerText.includes(value), { timeout: 15000 }, text);
    const clickText = (text) => page.evaluate((value) => { const element = [...document.querySelectorAll('button,a')].find((node) => node.textContent.trim() === value); if (!element) throw new Error('Missing control: ' + value); element.click(); }, text);
    const fillLabel = async (label, value) => { const handle = await page.evaluateHandle((text) => [...document.querySelectorAll('label')].find((node) => node.querySelector('span')?.textContent === text)?.querySelector('input'), label); const input = handle.asElement(); assert.ok(input, label); await input.click(); await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control'); await page.keyboard.type(value); await handle.dispose(); };
    await page.goto(base + '/investing');
    await waitText('Pikachu');
    assert.equal(await page.$eval('nav[aria-label="Primary"] a[aria-label="Card Investing"]', (node) => node.getAttribute('aria-current')), 'page');
    await clickText('What to avoid2 references');
    await waitText('Sharp price decline');
    await clickText('Worth researching1 references');
    await waitText('Charizard');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const output = process.env.UI_SCREENSHOT_DIR;
    if (output) { fs.mkdirSync(output, { recursive: true }); await page.screenshot({ path: path.join(output, 'investing-mobile.png'), fullPage: true }); }
    await page.click('a[href^="/card-show?"]');
    await waitText('Charizard');
    await waitText('Check the data first');
    assert.equal(await page.$$eval('input', (nodes) => nodes.filter((node) => node.closest('label')?.querySelector('span')?.textContent === 'Seller asking (USD)').length), 1);
    await fillLabel('Seller asking (USD)', '80');
    const confirmation = await page.$('input[type="checkbox"]');
    await confirmation.click();
    await waitText('Good buy on price');
    await fillLabel('Seller asking (USD)', '110');
    await waitText('Pass at this price');
    await fillLabel('Seller asking (USD)', '80');
    await waitText('Good buy on price');
    if (output) await page.screenshot({ path: path.join(output, 'card-show-market-check.png'), fullPage: true });
    await page.goto(base + '/cards');
    await waitText('Card Lookup');
    await fillLabel('Search cards', 'Charizard');
    await waitText('1 matching cards');
    assert.ok(await page.$('a[href="/cards/tp%3Asteady"]'));
    await fillLabel('Search cards', 'missing');
    await waitText('No cards found.');
    await fillLabel('Search cards', 'fail');
    await waitText('Retry card search');
    await fillLabel('Search cards', 'Pikachu');
    await waitText('1 matching cards');
    if (output) await page.screenshot({ path: path.join(output, 'card-lookup-mobile.png'), fullPage: true });
    await page.click('nav[aria-label="Lookup type"] a[href="/sets"]');
    await waitText('Set Lookup');
    assert.ok(await page.$('nav[aria-label="Lookup type"] a[href="/cards"]'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    assert.ok(requests.some((query) => query.includes('days=7')));
  } finally { if (browser) await browser.close(); await new Promise((resolve) => server.close(resolve)); }
});
