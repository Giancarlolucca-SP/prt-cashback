#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const tasks = [
  ["qa:functional:local", "RBAC, endpoints sensiveis e rotas principais"],
  ["qa:commercial:local", "clientes, leads, agenda, venda e historico"],
  ["qa:vehicles:local", "estoque, compras, avaliacao e bloqueios sensiveis"],
];

function npmCli() {
  if (process.env.npm_execpath) {
    return process.env.npm_execpath;
  }

  return process.platform === "win32"
    ? "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js"
    : "/usr/local/lib/node_modules/npm/bin/npm-cli.js";
}

function printTaskList() {
  console.log("qa:core:local cobre:");
  for (const [script, description] of tasks) {
    console.log(`- ${script}: ${description}`);
  }
}

if (process.argv.includes("--list")) {
  printTaskList();
  process.exit(0);
}

for (const [script, description] of tasks) {
  console.log(`\n[qa:core:local] ${script} - ${description}`);
  const result = spawnSync(process.execPath, [npmCli(), "run", script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exitCode = 1;
    break;
  }

  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    break;
  }
}

if (!process.exitCode) {
  console.log("\nqa:core:local ok");
}
