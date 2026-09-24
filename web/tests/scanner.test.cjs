// Run with `node --test tests/scanner.test.cjs`; no camera or model download needed.
/* eslint-disable @typescript-eslint/no-require-imports -- This Node test harness registers a CommonJS TypeScript loader. */
const ts = require("typescript");
const fs = require("node:fs");
require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  module._compile(outputText, filename);
};
require("./scanner.test.ts");
