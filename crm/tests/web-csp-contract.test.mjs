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

function parseDirectives(csp) {
  return new Map(
    csp
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => Boolean(name))
      .map(([name, ...values]) => [name, values]),
  );
}

test("web CSP allows unsafe-eval only outside production", () => {
  const developmentCsp = readCsp("development");
  const productionCsp = readCsp("production");

  assert.match(developmentCsp, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
  assert.match(productionCsp, /script-src 'self' 'unsafe-inline'(;|$)/);
  assert.doesNotMatch(productionCsp, /'unsafe-eval'/);
});

test("web CSP blocks remote embeds and keeps media/image sources constrained", () => {
  const directives = parseDirectives(readCsp("production"));

  assert.deepEqual(directives.get("default-src"), ["'self'"]);
  assert.deepEqual(directives.get("img-src"), ["'self'", "data:", "blob:"]);
  assert.deepEqual(directives.get("media-src"), ["'self'", "blob:"]);
  assert.deepEqual(directives.get("frame-src"), ["'none'"]);
  assert.deepEqual(directives.get("object-src"), ["'none'"]);
  assert.deepEqual(directives.get("base-uri"), ["'self'"]);
  assert.deepEqual(directives.get("form-action"), ["'self'"]);
});

test("web CSP limits connections to self and configured API origin", () => {
  const previousApiUrl = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = "https://api.crm.example.test/v1";

  try {
    const directives = parseDirectives(readCsp("production"));
    assert.deepEqual(directives.get("connect-src"), ["'self'", "https://api.crm.example.test"]);
  } finally {
    if (previousApiUrl === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = previousApiUrl;
    }
  }
});
