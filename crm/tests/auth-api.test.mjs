import test from "node:test";
import { runTsxSmoke } from "./helpers/run-tsx-smoke.mjs";

test("auth API supports login, session lookup and RBAC decisions", () => {
  runTsxSmoke("tests/auth-api-smoke.ts", { LOG_LEVEL: "fatal", PRISMA_LOG_LEVEL: "silent" });
});
