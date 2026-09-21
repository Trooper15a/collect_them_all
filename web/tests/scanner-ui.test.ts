import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const scannerPath = path.join(testDir, "..", "src", "components", "Scanner.tsx");
const scanner = fs.readFileSync(scannerPath, "utf8");

test("a visible live match remains tappable while a manual identification is pending", () => {
  assert.doesNotMatch(scanner, /if \(busy \|\| live\.length === 0\) return/);
});

test("the identify button reuses a visible live result instead of starting another match", () => {
  const captureBody = scanner.slice(scanner.indexOf("async function capture()"), scanner.indexOf("function acceptLive()"));
  assert.match(captureBody, /if \(live\.length > 0\)/);
  assert.ok(captureBody.indexOf("if (live.length > 0)") < captureBody.indexOf("setBusy(true)"));
});

test("live mode waits for its background result instead of starting a duplicate manual scan", () => {
  const captureBody = scanner.slice(scanner.indexOf("async function capture()"), scanner.indexOf("function acceptLive()"));
  assert.match(captureBody, /if \(auto\) return/);
  assert.ok(captureBody.indexOf("if (auto) return") < captureBody.indexOf("setBusy(true)"));
  assert.match(scanner, /auto \? "Scanning…"/);
});
