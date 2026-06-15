import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

test("auth API supports login, session lookup and RBAC decisions", () => {
  execFileSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), "tests/auth-api-smoke.ts"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, LOG_LEVEL: "fatal", PRISMA_LOG_LEVEL: "silent" },
  });
});
