import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

test("daily QA helper writes a failure log with diagnostics", () => {
  const runId = `test-${process.pid}-${Date.now()}`;
  const logPath = resolve(process.cwd(), ".dev-logs", `qa-daily-auto-${runId}.failure.log`);
  rmSync(logPath, { force: true });

  const result = spawnSync(process.execPath, ["scripts/qa-daily-auto-local.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      QA_AUTO_FAIL_FAST: "true",
      QA_AUTO_RUN_ID: runId,
    },
  });

  try {
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /qa:daily:auto:local failed/);
    assert.match(result.stderr, new RegExp(`qa-daily-auto-${runId}\\.failure\\.log`));

    const logContent = readFileSync(logPath, "utf8");
    assert.match(logContent, /Forced QA daily auto failure for log test/);
    assert.match(logContent, /preferredApiPort: 3333/);
    assert.match(logContent, /preferredWebPort: 3001/);
    assert.match(logContent, /captured output:/);
    assert.match(logContent, /qa:daily:auto:local preflight/);
  } finally {
    rmSync(logPath, { force: true });
  }
});
