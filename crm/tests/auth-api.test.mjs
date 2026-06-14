import { execSync } from "node:child_process";
import test from "node:test";

test("auth API supports login, session lookup and RBAC decisions", () => {
  execSync("npx tsx tests/auth-api-smoke.ts", {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, LOG_LEVEL: "fatal", PRISMA_LOG_LEVEL: "silent" },
  });
});
