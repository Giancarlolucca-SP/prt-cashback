import assert from "node:assert/strict";
import test from "node:test";
import {
  findPortConflicts,
  findSuspiciousProcesses,
  parsePortList,
  resolvePortList
} from "../scripts/dev-check.mjs";

test("parsePortList returns defaults when value is empty", () => {
  assert.deepEqual(parsePortList(""), ["3000", "3001", "3333"]);
});

test("resolvePortList supports named profiles and custom lists", () => {
  assert.deepEqual(resolvePortList("web"), ["3000", "3001"]);
  assert.deepEqual(resolvePortList("api"), ["3333"]);
  assert.deepEqual(resolvePortList("3005, 3335"), ["3005", "3335"]);
});

test("findSuspiciousProcesses can filter by dev target", () => {
  const rows = [
    { pid: "10", name: "node", command: "next dev apps/web" },
    { pid: String(process.pid), name: "node", command: "next dev apps/web" },
    { pid: "11", name: "node", command: "node harmless.js" },
    { pid: "12", name: "cmd.exe", command: "npm run dev:check:web && next dev apps/web" },
    { pid: "13", name: "cmd.exe", command: "npm run dev:check:api && tsx watch apps/api/src/server.ts" },
    { pid: "14", name: "node", command: "tsx watch apps/api/src/server.ts" }
  ];
  assert.deepEqual(findSuspiciousProcesses(rows), [rows[0], rows[5]]);
  assert.deepEqual(findSuspiciousProcesses(rows, process.pid, "web"), [rows[0]]);
  assert.deepEqual(findSuspiciousProcesses(rows, process.pid, "api"), [rows[5]]);
});

test("findPortConflicts detects configured ports", () => {
  const rows = [
    { port: "3000", pid: "100", address: "0.0.0.0:3000" },
    { port: "9999", pid: "101", address: "0.0.0.0:9999" }
  ];
  assert.deepEqual(findPortConflicts(rows, ["3000"]), [rows[0]]);
});
