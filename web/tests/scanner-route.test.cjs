/* eslint-disable @typescript-eslint/no-require-imports -- This Node test harness isolates the server route. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

test("cold concurrent matches share one game-filtered index load", async () => {
  let queries = 0;
  let releaseRows;
  const rowsReady = new Promise((resolve) => { releaseRows = resolve; });
  const embedding = Buffer.from(new Uint16Array([0x3c00, 0]).buffer).toString("base64");
  const rows = [{
    cardId: "test-card", embedding, name: "Test Card", setCode: "test",
    setName: "Test Set", cardNumber: "1", tcg: "pokemon", language: "en",
  }];
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, "../src/app/api/scan/match/route.ts"), "utf8");
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, {
    exports, Buffer, Float32Array, Uint16Array, Date, console: { log() {}, error() {} },
    process: { cwd: () => __dirname },
    require: (name) => {
      if (name === "next/server") return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } };
      if (name === "node:fs") return { readFileSync: () => { throw new Error("no static index"); } };
      if (name === "node:path") return path;
      if (name === "@/db") return {
        db: { select: () => ({ from: () => ({ innerJoin: () => ({ where: (filter) => {
          assert.equal(filter.value, "pokemon");
          queries++;
          return rowsReady;
        } }) }) }) },
        schema: { cardEmbeddings: { cardId: "id", embedding: "embedding" }, cards: {
          id: "id", name: "name", setCode: "set", setName: "setName",
          cardNumber: "num", tcg: "tcg", language: "lang",
        } },
      };
      if (name === "drizzle-orm") return { eq: (_column, value) => ({ value }) };
      if (name === "@/lib/scanner/top-matches") return {
        insertTopMatch: (list, match) => list.push(match),
        selectPreferredMatches: (best) => best,
      };
      if (name === "@/lib/types") return { TCG_IDS: ["pokemon", "mtg"] };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });

  const request = { json: async () => ({ embedding: [1, 0], tcg: "pokemon" }) };
  const first = exports.POST(request);
  const second = exports.POST(request);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(queries, 1);
  releaseRows(rows);
  const results = await Promise.all([first, second]);
  for (const response of results) {
    assert.equal(response.status, 200);
    assert.equal(response.body.matches[0].card.id, "test-card");
    assert.equal(response.body.matches[0].score, 1);
  }
  await exports.POST(request);
  assert.equal(queries, 1);
});

function routeHarness({ staticIndex, halfWords, rows = [], loadRows, failStatic = false } = {}) {
  const reads = [], filters = [];
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, "../src/app/api/scan/match/route.ts"), "utf8");
  const readFile = async filename => {
    reads.push(path.basename(filename));
    if (!staticIndex || failStatic) throw new Error("no static index");
    return filename.endsWith("index.json") ? JSON.stringify(staticIndex) : Buffer.from(new Uint16Array(halfWords).buffer);
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, {
    exports, Buffer, Float32Array, Uint16Array, Date, URL, setImmediate, console: { log() {}, error() {} },
    process: { cwd: () => __dirname },
    require: name => {
      if (name === "next/server") return { NextResponse: { json: (body, options) => ({ body: JSON.parse(JSON.stringify(body)), status: options?.status ?? 200 }) } };
      if (name === "node:fs") return { promises: { readFile }, readFileSync: () => { throw new Error("Static index reads must be asynchronous"); } };
      if (name === "node:path") return path;
      if (name === "@/lib/types") return { TCG_IDS: ["pokemon", "mtg"] };
      if (name === "@/db") return {
        db: { select: () => ({ from: () => ({ innerJoin: () => ({ where: filter => {
          filters.push(filter?.value);
          return loadRows ? loadRows(filter?.value) : Promise.resolve(rows);
        } }) }) }) },
        schema: { cardEmbeddings: {}, cards: {} },
      };
      if (name === "drizzle-orm") return { eq: (_column, value) => ({ value }) };
      if (name === "@/lib/scanner/top-matches") {
        const helper = {};
        vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/lib/scanner/top-matches.ts"), "utf8"), {
          compilerOptions: { module: ts.ModuleKind.CommonJS },
        }).outputText, { exports: helper });
        return helper;
      }
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { ...exports, reads, filters };
}

const getRequest = tcg => ({ url: `https://scanner.test/api/scan/match${tcg === undefined ? "" : `?tcg=${tcg}`}` });
const dbRow = (tcg = "pokemon") => ({ cardId: "db-card", name: "DB card", tcg, language: "en", embedding: Buffer.from(new Uint16Array([0x3c00, ...new Array(511).fill(0)]).buffer).toString("base64") });

test("readiness GET shares the same in-flight game index with POST and returns only readiness", async () => {
  let release;
  const rows = new Promise(resolve => { release = resolve; });
  const h = routeHarness({ loadRows: () => rows });
  assert.equal(typeof h.GET, "function", "GET warming must be available");
  const warm = h.GET(getRequest("pokemon"));
  const match = h.POST({ json: async () => ({ embedding: [1, ...new Array(511).fill(0)], tcg: "pokemon" }) });
  await new Promise(setImmediate);
  assert.deepEqual(h.filters, ["pokemon"]);
  release([dbRow()]);
  assert.deepEqual((await warm).body, { ready: true });
  const response = await match;
  assert.equal(response.status, 200);
  assert.equal(response.body.matches[0].card.id, "db-card");
  assert.equal(response.body.matches[0].score, 1);
  await h.GET(getRequest("pokemon"));
  assert.equal(h.filters.length, 1);
});

test("readiness and POST reject unknown games before loading an index", async () => {
  const h = routeHarness();
  assert.equal(typeof h.GET, "function");
  assert.equal((await h.GET(getRequest("unknown"))).status, 400);
  assert.equal((await h.POST({ json: async () => ({ embedding: [1, 0], tcg: "unknown" }) })).status, 400);
  assert.equal(h.reads.length, 0);
  assert.equal(h.filters.length, 0);
});

test("readiness isolates games and retries a failed cold database load", async () => {
  let fail = true;
  const h = routeHarness({ loadRows: async game => { if (fail) { fail = false; throw new Error("offline"); } return [dbRow(game)]; } });
  assert.equal(typeof h.GET, "function");
  assert.equal((await h.GET(getRequest("pokemon"))).status, 503);
  assert.equal((await h.GET(getRequest("pokemon"))).body.ready, true);
  assert.equal((await h.GET(getRequest("mtg"))).body.ready, true);
  assert.deepEqual(h.filters, ["pokemon", "pokemon", "mtg"]);
});

test("static warming reads asynchronously once and preserves half-float ranking, language preference and dimensions", async () => {
  const cards = [
    { id: "jp", name: "Japanese", tcg: "pokemon", lang: "ja" },
    { id: "en", name: "English", tcg: "pokemon", lang: "en" },
    { id: "other", name: "Other game", tcg: "mtg", lang: "en" },
  ];
  const h = routeHarness({ staticIndex: { dim: 2, count: 3, cards }, halfWords: [0x3c00, 0, 0x3b9a, 0, 0x4000, 0] });
  assert.equal(typeof h.GET, "function");
  const first = h.GET(getRequest("pokemon")), second = h.GET(getRequest("pokemon"));
  assert.deepEqual((await first).body, { ready: true });
  await second;
  assert.equal(h.reads.filter(name => name === "index.json").length, 1);
  assert.equal(h.reads.filter(name => name === "embeddings.bin").length, 1);
  const response = await h.POST({ json: async () => ({ embedding: [1, 0], tcg: "pokemon", lang: "en" }) });
  assert.equal(response.status, 200);
  assert.equal(response.body.matches[0].card.id, "en");
  assert.equal(response.body.matches[0].score, 0.9501953125);
  assert.equal((await h.POST({ json: async () => ({ embedding: [1, 0, 0], tcg: "pokemon" }) })).status, 400);
});

test("chunked static conversion preserves values across a yield boundary", async () => {
  const dim = 1024 * 1024 + 2;
  const halfWords = new Uint16Array(dim);
  halfWords[0] = 0x3800; // 0.5
  halfWords[dim - 2] = 0x4000; // 2, first value after the yield
  halfWords[dim - 1] = 0xbc00; // -1
  const query = new Array(dim).fill(0);
  query[0] = query[dim - 2] = query[dim - 1] = 1;
  const h = routeHarness({ staticIndex: { dim, count: 1, cards: [{ id: "boundary", tcg: "pokemon" }] }, halfWords });
  const warm = await h.GET(getRequest("pokemon"));
  assert.equal(warm.status, 200);
  const match = await h.POST({ json: async () => ({ embedding: query, tcg: "pokemon" }) });
  assert.equal(match.status, 200);
  assert.equal(match.body.matches[0].card.id, "boundary");
  assert.equal(match.body.matches[0].score, 1.5);
});
