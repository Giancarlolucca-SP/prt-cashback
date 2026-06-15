import test from "node:test";
import { runTsxSmoke } from "./helpers/run-tsx-smoke.mjs";

test("rate limiting profiles and honeypots are classified", () => {
  runTsxSmoke("tests/rate-limit-smoke.ts", { LOG_LEVEL: "fatal" });
});
