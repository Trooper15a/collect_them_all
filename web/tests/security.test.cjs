const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Execute real handlers against isolated account fixtures. Never load the real
// database module, environment files, authentication providers or network APIs.
function harness(userId = 'alice') {
  const data = {
    users: [{ id: 'alice', email: 'alice@example.test' }, { id: 'bob', email: 'bob@example.test' }, { id: 'admin', email: 'isadin531@gmail.com' }],
    portfolios: [{ id: 1, userId: 'alice', name: 'Alice' }, { id: 2, userId: 'bob', name: 'Bob' }],
    portfolioItems: [{ id: 11, portfolioId: 1, cardId: 'tp:1', quantity: 1 }, { id: 22, portfolioId: 2, cardId: 'tp:1', quantity: 7 }],
    boxOpens: [{ id: 1, userId: 'alice', cost: 1, costCurrency: 'USD' }, { id: 2, userId: 'bob', cost: 2, costCurrency: 'USD' }],
    boxOpenItems: [{ id: 11, boxOpenId: 1, cardId: 'tp:1', quantity: 1 }, { id: 22, boxOpenId: 2, cardId: 'tp:1', quantity: 7 }],
    cards: [{ id: 'tp:1', name: 'Card', pricesJson: '{}' }],
    alerts: [{ id: 1, userId: 'alice', cardId: 'tp:1', thresholdPct: 10 }, { id: 2, userId: 'bob', cardId: 'tp:1', thresholdPct: 20 }],
    settings: [], sets: [], cardLinks: [], portfolioSnapshots: [], deckCards: [], decks: [],
  };
  const schema = new Proxy({}, { get(_, table) {
    return new Proxy({ table }, { get(obj, key) { return key === 'table' ? obj.table : key === 'column' ? undefined : { table, column: key }; } });
  } });
  const val = (v, row) => v?.column ? row[v.table]?.[v.column] : v;
  const orm = {
    eq: (a, b) => row => val(a, row) === val(b, row),
    and: (...p) => row => p.filter(f => typeof f === 'function').every(f => f(row)),
    or: (...p) => row => p.filter(f => typeof f === 'function').some(f => f(row)),
    gte: (a, b) => row => val(a, row) >= val(b, row),
    lt: (a, b) => row => val(a, row) < val(b, row),
    isNull: a => row => val(a, row) == null,
    inArray: (a, b) => row => (Array.isArray(b) ? b : b.run().map(x => Object.values(x)[0])).includes(val(a, row)),
    sql: Object.assign((strings, ...args) => ({ strings, args }), { raw: text => ({ text }) }),
  };
  const queries = [];
  function query(mode, table, selection) {
    const q = { mode, table: table?.table, selection, predicates: [], joins: [], patch: null,
      from(t) { this.table = t.table; return this; },
      innerJoin(t, on) { this.joins.push([t.table, on]); return this; },
      where(p) { this.predicates.push(p); return this; },
      limit(n) { this.max = n; return this; }, orderBy() { return this; }, groupBy(...cols) { this.groups = cols; return this; },
      set(p) { this.patch = p; return this; }, values(p) { this.patch = p; return this; },
      onConflictDoUpdate(p) { this.conflict = p; return this; },
      returning() { return this; },
      run() {
        queries.push(this);
        if (this.mode === 'insert') {
          const values = Array.isArray(this.patch) ? this.patch : [this.patch];
          return values.map(v => {
            const targets = this.conflict ? [].concat(this.conflict.target) : [];
            const existing = targets.length && data[this.table].find(r => targets.every(c => r[c.column] === v[c.column]));
            if (existing) { Object.assign(existing, this.conflict.set); return existing; }
            const r = { id: data[this.table].length + 100, ...v }; data[this.table].push(r); return r;
          });
        }
        let rows = (data[this.table] || []).map(r => ({ [this.table]: r }));
        for (const [t, on] of this.joins) rows = rows.flatMap(r => (data[t] || []).map(v => ({ ...r, [t]: v })).filter(on));
        rows = rows.filter(r => this.predicates.every(p => typeof p !== 'function' || p(r)));
        if (this.max != null) rows = rows.slice(0, this.max);
        if (this.mode === 'update') rows.forEach(r => Object.assign(r[this.table], this.patch));
        if (this.mode === 'delete') data[this.table] = data[this.table].filter(r => !rows.some(x => x[this.table] === r));
        const groups = this.groups ? [...Map.groupBy(rows, r => JSON.stringify(this.groups.map(c => val(c, r)))).values()] : rows.map(r => [r]);
        return groups.map(group => {
          const r = group[0];
          return !this.selection ? r[this.table] : Object.fromEntries(Object.entries(this.selection).map(([k, v]) => [k,
            Array.isArray(v?.strings) && v.strings.join('').startsWith('sum(') ? group.reduce((s, row) => s + val(v.args[0], row), 0) : v?.column ? val(v, r) : v?.table ? r[v.table] : v]));
        });
      }, then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject); },
    }; return q;
  }
  const db = { select: s => query('select', null, s), update: t => query('update', t), delete: t => query('delete', t), insert: t => query('insert', t), execute: () => { throw new Error('Unexpected SQL execution'); } };
  const auth = { auth: async () => userId ? { user: { id: userId } } : null, requireUserId: async () => { if (!userId) throw new Error('Unauthorized'); return userId; } };
  const stubs = {
    '@/db': { db, schema }, 'drizzle-orm': orm,
    'next/server': { NextResponse: Response }, '@/lib/auth': auth,
    '@/lib/portfolio': { snapshotPortfolios: async () => {} },
    '@/lib/currency': { getRates: async () => ({}), convert: x => x },
    '@/lib/cards': { rowToCard: r => ({ ...r, prices: {} }), getCard: async id => data.cards.find(c => c.id === id) },
    '@/lib/types': { bestPrice: () => null, TCG_IDS: ['pokemon', 'mtg', 'yugioh'] },
  };
  function load(relative, overrides = {}) {
    const cache = {};
    function read(filename) {
      filename = path.resolve(__dirname, '..', filename);
      if (!path.extname(filename)) filename += '.ts';
      if (cache[filename]) return cache[filename].exports;
      const module = { exports: {} }; cache[filename] = module;
      const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
      const localRequire = id => {
        let key = id;
        if (id.startsWith('.')) key = '@/' + path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(filename), id)).replaceAll('\\', '/');
        if (key in overrides) return overrides[key];
        if (key in stubs) return stubs[key];
        if (key.startsWith('@/')) return read('src/' + key.slice(2));
        return require(id);
      };
      vm.runInNewContext('(function(require,module,exports){' + code + '\n})', { Response, Request, URL, console, process: { env: {} }, Buffer, Date, setTimeout, clearTimeout, fetch: () => { throw new Error('Network prohibited in security tests'); } }, { filename })(localRequire, module, module.exports);
      return module.exports;
    }
    return read(relative);
  }
  const request = (url, method = 'GET', body) => Object.assign(new Request('https://example.test' + url, { method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }) }), { nextUrl: new URL('https://example.test' + url) });
  return { data, db, schema, orm, queries, load, request, setUser: id => { userId = id; } };
}
const ctx = id => ({ params: Promise.resolve({ id: String(id) }) });

test('portfolio item updates/deletes/transfers reject another owner and preserve own operations', async () => {
  const h = harness();
  const route = h.load('src/app/api/items/[id]/route.ts');
  assert.equal((await route.PATCH(h.request('/api/items/22', 'PATCH', { quantity: 99 }), ctx(22))).status, 404);
  await route.DELETE(h.request('/api/items/22', 'DELETE'), ctx(22));
  assert.equal(h.data.portfolioItems.find(i => i.id === 22).quantity, 7);
  assert.equal((await route.PATCH(h.request('/api/items/11', 'PATCH', { quantity: 3 }), ctx(11))).status, 200);
  assert.equal(h.data.portfolioItems.find(i => i.id === 11).quantity, 3);
  const transfer = h.load('src/app/api/items/[id]/transfer/route.ts');
  assert.equal((await transfer.POST(h.request('/api/items/22/transfer', 'POST', { toPortfolioId: 1 }), ctx(22))).status, 404);
  assert.equal((await transfer.POST(h.request('/api/items/11/transfer', 'POST', { toPortfolioId: 2 }), ctx(11))).status, 404);
  assert.equal(h.data.portfolioItems.find(i => i.id === 22).portfolioId, 2);
});

test('box opening parent and child checks reject cross-owner and mismatched-parent deletion', async () => {
  const h = harness();
  const route = h.load('src/app/api/opens/[id]/route.ts');
  assert.equal((await route.GET(h.request('/api/opens/2'), ctx(2))).status, 404);
  await route.DELETE(h.request('/api/opens/2', 'DELETE'), ctx(2));
  assert.ok(h.data.boxOpens.find(o => o.id === 2));
  const items = h.load('src/app/api/opens/[id]/items/route.ts');
  assert.equal((await items.POST(h.request('/api/opens/2/items', 'POST', { cardId: 'tp:1' }), ctx(2))).status, 404);
  await items.DELETE(h.request('/api/opens/1/items?itemId=22', 'DELETE'), ctx(1));
  assert.ok(h.data.boxOpenItems.find(i => i.id === 22));
  await items.DELETE(h.request('/api/opens/1/items?itemId=11', 'DELETE'), ctx(1));
  assert.equal(h.data.boxOpenItems.some(i => i.id === 11), false);
});

test('anonymous callers cannot mutate private item/open routes', async () => {
  const h = harness(null);
  for (const [file, method, body] of [
    ['items/[id]', 'PATCH', { quantity: 2 }], ['items/[id]/transfer', 'POST', { toPortfolioId: 1 }],
    ['opens/[id]', 'DELETE'], ['opens/[id]/items', 'POST', { cardId: 'tp:1' }],
  ]) {
    assert.equal((await h.load('src/app/api/' + file + '/route.ts')[method](h.request('/api/test', method, body), ctx(1))).status, 401);
  }
  assert.equal(h.queries.length, 0);
});

test('alerts isolate list, conflict updates, acknowledgment and deletion for the same card', async () => {
  const h = harness();
  const alerts = h.load('src/lib/alerts.ts');
  assert.deepEqual(Array.from(await alerts.listAlerts('alice'), a => a.id), [1]);
  await alerts.upsertAlert('alice', 'tp:1', 50);
  assert.equal(h.data.alerts.find(a => a.id === 1).thresholdPct, 50);
  assert.equal(h.data.alerts.find(a => a.id === 2).thresholdPct, 20);
  assert.equal(await alerts.acknowledgeAlert('alice', 2), null);
  await alerts.deleteAlert('alice', 2);
  assert.ok(h.data.alerts.find(a => a.id === 2));
  await alerts.deleteAlert('alice', 1);
  assert.equal(h.data.alerts.some(a => a.id === 1), false);
});

test('preferences stay per-account while operational settings remain global', async () => {
  const h = harness();
  const prefs = h.load('src/lib/user-settings.ts');
  const operational = h.load('src/lib/cache.ts');
  await prefs.setUserSetting('bulkPortfolio', 'Alice private binder');
  await prefs.setUserSetting('onboardingState', 'dismissed');
  await operational.setSetting('tcgcsv:last', 'import status');
  h.setUser('bob');
  assert.equal(await prefs.getUserSetting('bulkPortfolio', 'Default'), 'Default');
  assert.equal(await prefs.getUserSetting('onboardingState', 'pending'), 'pending');
  await prefs.setUserSetting('bulkPortfolio', 'Bob binder');
  await prefs.setUserSetting('onboardingState', 'completed');
  assert.equal(await operational.getSetting('tcgcsv:last', ''), 'import status');
  h.setUser('alice');
  assert.equal(await prefs.getUserSetting('bulkPortfolio', ''), 'Alice private binder');
  assert.equal(await prefs.getUserSetting('onboardingState', ''), 'dismissed');
  h.setUser(null);
  assert.equal(await prefs.getUserSetting('bulkPortfolio', 'Default'), 'Default');
  await assert.rejects(prefs.setUserSetting('currency', 'CAD'), /Unauthorized/);
});

test('maintenance and global mapping mutations reject anonymous and ordinary accounts before work', async () => {
  for (const user of [null, 'alice']) {
    const h = harness(user);
    let work = 0;
    const run = async () => { work++; return {}; };
    const overrides = {
      '@/lib/tcgcsv': { defaultCategoryIds: () => [3], importStatus: async () => ({ running: false }), importTcgcsv: run, TCGCSV_CATEGORIES: [] },
      '@/lib/scan-rebuild': { rebuildScanIndex: run },
      '@/lib/update-index': { getStatus: () => ({ running: false }), runUpdate: run },
      '@/lib/resolve': { linkManually: run, resolveScanId: run }, '@/lib/model-index': { indexCard: () => null },
    };
    for (const route of ['cleanup', 'tcgcsv', 'scan/rebuild', 'update-index', 'resolve']) {
      const res = await h.load('src/app/api/' + route + '/route.ts', overrides).POST(h.request('/api/' + route, 'POST', { scanId: 'tcgdex:test', cardId: 'tp:1' }));
      assert.equal(res.status, user ? 403 : 401, route);
    }
    assert.equal(work, 0);
  }
  const h = harness('admin');
  let work = 0;
  const route = h.load('src/app/api/scan/rebuild/route.ts', { '@/lib/scan-rebuild': { rebuildScanIndex: async () => { work++; return { added: 1 }; } } });
  assert.equal((await route.POST()).status, 200);
  assert.equal(work, 1);
});

test('export explicitly binds owner and neutralizes spreadsheet formulas', async () => {
  const h = harness();
  let owner;
  const row = { portfolioName: '=1+1', card: { id: 'tp:1', name: 'Card', prices: {} }, quantity: 1, value: 1, gain: null, gainPct: null, addedAt: '2026-01-01', notes: '@formula' };
  const route = h.load('src/app/api/export/route.ts', { '@/lib/portfolio': { valuedItems: async (_p, _c, _f, id) => { owner = id; return [row]; } } });
  const res = await route.GET(h.request('/api/export'));
  assert.equal(owner, 'alice');
  const csv = await res.text();
  assert.match(csv, /'=1\+1/);
  assert.match(csv, /'@formula/);
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  h.setUser(null);
  assert.equal((await route.GET(h.request('/api/export'))).status, 401);
});

test('deck comparison ignores other owners even when both collect the same card', async () => {
  const h = harness();
  h.data.deckCards.push({ id: 1, deckId: 1, cardId: 'tp:1', cardName: 'Card', quantity: 4, section: 'main' });
  const decks = h.load('src/lib/decks.ts');
  const alice = await decks.checkDeckOwnership(1, 'alice');
  const bob = await decks.checkDeckOwnership(1, 'bob');
  assert.equal(alice.owned, 1);
  assert.equal(bob.owned, 4);
});

test('public card read returns history without starting an archive job', async () => {
  const h = harness(null);
  let jobs = 0;
  const route = h.load('src/app/api/cards/[id]/route.ts', {
    '@/lib/cards': { getCard: async () => ({ id: 'tp:1' }), getPriceHistory: async () => [] },
    '@/lib/tcgcsv': { backfillCardHistory: async () => { jobs++; return 0; } },
  });
  const res = await route.GET(h.request('/api/cards/tp:1'), ctx('tp:1'));
  assert.equal(res.status, 200);
  assert.equal(jobs, 0);
});

test('legacy import does not reuse an ownerless portfolio', async () => {
  const h = harness();
  h.data.portfolios.push({ id: 3, userId: null, name: 'Legacy' });
  const importer = h.load('src/lib/import.ts');
  await importer.commitImport([{ line: 2, raw: {}, match: { id: 'tp:1' }, status: 'matched', portfolio: 'Legacy', quantity: 1, condition: 'NM', currency: 'USD' }], 'Imported', 'alice');
  const created = h.data.portfolioItems.at(-1);
  assert.notEqual(created.portfolioId, 3);
  assert.equal(h.data.portfolios.find(p => p.id === created.portfolioId).userId, 'alice');
  assert.equal(h.data.portfolios.find(p => p.id === 3).userId, null);
});

test('service worker never intercepts private APIs, navigations or mutations and purges legacy state', async () => {
  const handlers = {};
  const removed = [];
  let deletedDb = null;
  let networkCalls = 0;
  let claimed = false;
  const caches = { keys: async () => ['cta-api-v2', 'cta-meta', 'rnp-shell-v2', 'rnp-model-v3'], delete: async k => { removed.push(k); return true; }, open: async () => ({ match: async () => null, put: async () => {} }) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8'), {
    self: { addEventListener: (name, fn) => { handlers[name] = fn; }, skipWaiting() {}, clients: { claim: async () => { claimed = true; } } },
    caches, indexedDB: { deleteDatabase: name => { deletedDb = name; const req = {}; queueMicrotask(() => req.onsuccess()); return req; } },
    location: { origin: 'https://example.test' }, URL, Response, Set,
    fetch: async () => { networkCalls++; return new Response('asset'); },
  });
  let activation;
  handlers.activate({ waitUntil: p => { activation = p; } });
  await activation;
  assert.deepEqual(removed.sort(), ['cta-api-v2', 'cta-meta', 'rnp-shell-v2'].sort());
  assert.equal(deletedDb, 'cta-offline');
  assert.equal(claimed, true);
  for (const [url, method, mode] of [['/api/portfolios', 'GET', 'cors'], ['/api/sets', 'GET', 'cors'], ['/api/auth/signout', 'POST', 'cors'], ['/api/import', 'PUT', 'cors'], ['/', 'GET', 'navigate']]) {
    let intercepted = false;
    handlers.fetch({ request: { url: 'https://example.test' + url, method, mode, headers: new Headers() }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false, url);
  }
  handlers.message({ data: 'SYNC_QUEUE' });
  assert.equal(networkCalls, 0);
  let asset;
  handlers.fetch({ request: new Request('https://example.test/ort/model.wasm'), respondWith: p => { asset = p; } });
  assert.equal((await asset).status, 200);
  assert.equal(networkCalls, 1);
  let cachedModel = new Response('old model');
  caches.open = async () => ({ match: async () => cachedModel, put: async (_req, res) => { cachedModel = res; } });
  let refresh;
  handlers.fetch({ request: new Request('https://example.test/model/card_embedder.onnx'), respondWith: p => { asset = p; }, waitUntil: p => { refresh = p; } });
  assert.equal(await (await asset).text(), 'old model');
  await refresh;
  assert.equal(await cachedModel.text(), 'asset');
  assert.equal(networkCalls, 2, 'stable model URLs must revalidate even on cache hits');
});

test('history sums owned portfolio snapshots and excludes global and foreign snapshots', async () => {
  const h = harness();
  h.data.portfolios.push({ id: 3, userId: 'alice', name: 'Other Alice' });
  h.data.portfolioSnapshots.push(
    { portfolioId: 0, date: '2026-01-01', valueUsd: 999, costUsd: 888 },
    { portfolioId: 1, date: '2026-01-01', valueUsd: 10, costUsd: 5 },
    { portfolioId: 2, date: '2026-01-01', valueUsd: 100, costUsd: 50 },
    { portfolioId: 3, date: '2026-01-01', valueUsd: 20, costUsd: 10 },
  );
  const portfolio = h.load('src/lib/portfolio.ts');
  const series = await portfolio.valueSeries(null, 'ALL', 'USD', {}, 'alice');
  assert.equal(series.length, 1);
  assert.equal(series[0].value, 30);
  assert.equal(series[0].cost, 15);
  const own = await portfolio.valueSeries(1, 'ALL', 'USD', {}, 'alice');
  assert.equal(own[0].value, 10);
  assert.equal((await portfolio.valueSeries(2, 'ALL', 'USD', {}, 'alice')).length, 0);
});

test('anonymous set catalog never queries private holdings; signed-in queries enforce portfolio owner', async () => {
  for (const user of [null, 'alice']) {
    const h = harness(user);
    h.data.sets.push({ id: 'pokemon:test:eng', tcg: 'pokemon', code: 'test', language: 'eng', name: 'Set', total: 10 });
    Object.assign(h.data.cards[0], { tcg: 'pokemon', setCode: 'test', language: 'eng', cardNumber: '1' });
    const route = h.load('src/app/api/sets/[id]/route.ts');
    const res = await route.GET(h.request('/api/sets/pokemon:test:eng'), ctx('pokemon:test:eng'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.cards[0].owned, user ? 1 : 0);
    if (!user) assert.equal(h.queries.some(q => q.table === 'portfolioItems'), false);
    assert.equal(res.headers.get('cache-control'), 'private, no-store');
  }
});
