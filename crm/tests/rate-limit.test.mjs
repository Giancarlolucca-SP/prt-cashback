import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

test("rate limiting profiles and honeypots are classified", () => {
  execFileSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "tests/rate-limit-smoke.ts"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, LOG_LEVEL: "fatal" },
  });
});
