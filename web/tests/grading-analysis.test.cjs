/* eslint-disable @typescript-eslint/no-require-imports -- Run the pure browser analysis in Node. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/lib/grading/analysis.ts"), "utf8");
const analysis = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: analysis, Uint8Array, Uint8ClampedArray, Int32Array, Math });

function fixture() {
  const width = 320, height = 180;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    let rgb = [110, 200, 35]; // Scanner holder
    if (x >= 80 && x < 245 && y >= 22 && y < 152) rgb = [180, 180, 180]; // Card border
    if (x >= 94 && x < 231 && y >= 36 && y < 138) rgb = [20, 65, 180]; // Artwork
    data.set([...rgb, 255], i);
  }
  return { width, height, data };
}

test("finds the physical card inside the green fixture", () => {
  const image = fixture();
  const crop = analysis.suggestCardCrop(image);
  assert.ok(crop);
  assert.ok(Math.abs(crop.x - 80 / image.width) < 0.02);
  assert.ok(Math.abs(crop.y - 22 / image.height) < 0.02);
  assert.ok(Math.abs(crop.width - 165 / image.width) < 0.04);
});

test("uses the fixed holder aspect when one green edge is in shadow", () => {
  const image = fixture();
  for (let y = 0; y < image.height; y++) for (let x = 245; x < image.width; x++) {
    image.data.set([80, 80, 80, 255], (y * image.width + x) * 4);
  }
  const crop = analysis.suggestCardCrop(image);
  assert.ok(crop);
  assert.ok(Math.abs(crop.width - 165 / image.width) < 0.08);
});

test("does not claim perfect centering when no border can be measured", () => {
  const image = fixture();
  image.data.fill(255);
  assert.equal(analysis.suggestCardCrop(image), null);
  const measurement = analysis.measureCentering(image, { x: 0.2, y: 0.1, width: 0.6, height: 0.8 });
  assert.equal(measurement.confidence, "unavailable");
});

test("centering reports a near-symmetric printed border", () => {
  const image = fixture();
  const crop = analysis.suggestCardCrop(image);
  const measured = analysis.measureCentering(image, crop);
  assert.equal(measured.confidence, "measured");
  assert.ok(Math.abs(measured.leftRight[0] - 50) <= 5);
  assert.ok(Math.abs(measured.topBottom[0] - 50) <= 5);
});

test("a weak category limits the provisional overall estimate", () => {
  const estimate = analysis.estimatePregrade({ centering: 10, corners: 10, edges: 10, surface: 6 });
  assert.equal(estimate.score, 7);
  assert.equal(estimate.low, 6);
  assert.equal(estimate.high, 8);
});
