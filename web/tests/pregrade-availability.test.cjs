/* eslint-disable @typescript-eslint/no-require-imports -- Render the actual route with the project's component harness. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { clientHarness, nodes, text } = require("./client-harness.cjs");

test("Pre-grade displays its temporary availability message without grading controls", () => {
  const page = clientHarness("app/grade/page.tsx").render();
  assert.match(text(page), /Not available at this time/);
  assert.equal(nodes(page, node => node.type === "h1" && text(node) === "Pre-grade").length, 1);
  assert.equal(nodes(page, node => ["input", "button", "form", "video", "canvas"].includes(node.type)).length, 0);
});
