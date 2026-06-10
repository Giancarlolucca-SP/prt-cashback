import { execSync } from "node:child_process";
import test from "node:test";

test("rate limiting profiles and honeypots are classified", () => {
  execSync("npx tsx tests/rate-limit-smoke.ts", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, LOG_LEVEL: "fatal" },
  });
});
