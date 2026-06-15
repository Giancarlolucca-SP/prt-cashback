import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function readCsp(nodeEnv) {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      [
        "const config = (await import('./apps/web/next.config.mjs')).default;",
        "const headers = await config.headers();",
        "const csp = headers[0].headers.find((header) => header.key === 'Content-Security-Policy').value;",
        "console.log(csp);",
      ].join(" "),
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: nodeEnv,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("web CSP allows unsafe-eval only outside production", () => {
  const developmentCsp = readCsp("development");
  const productionCsp = readCsp("production");

  assert.match(developmentCsp, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
  assert.match(productionCsp, /script-src 'self' 'unsafe-inline'(;|$)/);
  assert.doesNotMatch(productionCsp, /'unsafe-eval'/);
});
