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
