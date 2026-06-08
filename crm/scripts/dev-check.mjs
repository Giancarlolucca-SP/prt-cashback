#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

const DEFAULT_PORTS = ["3000", "3001", "3333"];
const CHECK_PROFILES = {
  all: DEFAULT_PORTS,
  api: ["3333"],
  web: ["3000", "3001"],
};

export function parsePortList(value) {
  return (value || DEFAULT_PORTS.join(","))
    .split(",")
    .map((port) => port.trim())
    .filter(Boolean);
}

export function resolvePortList(value) {
  const profile = String(value || "").trim().toLowerCase();
  return CHECK_PROFILES[profile] ?? parsePortList(value);
}

export function findSuspiciousProcesses(processRows, currentPid = process.pid, target = "all") {
  const profile = String(target || "all").trim().toLowerCase();
  return processRows.filter((row) => {
    if (!row.pid || String(row.pid) === String(currentPid)) return false;
    const command = `${row.command || ""} ${row.name || ""}`.toLowerCase();
    if (
      command.includes("npm run dev:check && next dev") ||
      command.includes("npm run dev:check && tsx watch") ||
      command.includes("npm run dev:check:web && next dev") ||
      command.includes("npm run dev:check:api && tsx watch") ||
      command.includes("npm run dev:web") ||
      command.includes("npm run dev:api")
    ) {
      return false;
    }
    const isWebProcess =
      command.includes("next dev") ||
      command.includes("next-server");
    const isApiProcess =
      command.includes("tsx watch") ||
      command.includes("apps/api/src/server");

    if (profile === "web") return isWebProcess;
    if (profile === "api") return isApiProcess;
    return isWebProcess || isApiProcess;
  });
}

export function findPortConflicts(netstatRows, ports) {
  const portSet = new Set(ports.map(String));
  return netstatRows.filter((row) => portSet.has(String(row.port)));
}

function readWindowsProcesses() {
  const script = [
    "Get-CimInstance Win32_Process |",
      "Select-Object ProcessId,Name,CommandLine |",
      "ConvertTo-Json -Compress"
  ].join(" ");
  const output = execFileSync("powershell", ["-NoProfile", "-Command", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  const parsed = JSON.parse(output || "[]");
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map((item) => ({
    pid: item.ProcessId,
    name: item.Name,
    command: item.CommandLine || ""
  }));
}

function readUnixProcesses() {
  const output = execFileSync("ps", ["-eo", "pid=,comm=,args="], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pid, name, ...commandParts] = line.split(/\s+/);
      return { pid, name, command: commandParts.join(" ") };
    });
}

function readNetstat() {
  const output = execFileSync("netstat", ["-ano"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("LISTEN"))
    .map((line) => {
      const parts = line.split(/\s+/);
      const address = parts[1] || "";
      const pid = parts[parts.length - 1];
      const port = address.includes(":") ? address.split(":").pop() : "";
      return { address, port, pid };
    })
    .filter((row) => row.port);
}

function main() {
  const target = process.argv[2] || process.env.DEV_CHECK_TARGET || "all";
  const ports = process.env.DEV_CHECK_PORTS ? parsePortList(process.env.DEV_CHECK_PORTS) : resolvePortList(target);
  const processRows = platform() === "win32" ? readWindowsProcesses() : readUnixProcesses();
  const netstatRows = readNetstat();

  const suspicious = findSuspiciousProcesses(processRows, process.pid, target);
  const conflicts = findPortConflicts(netstatRows, ports);

  if (suspicious.length === 0 && conflicts.length === 0) {
    console.log(`dev:check ok - nenhum processo suspeito nas portas ${ports.join(", ")}.`);
    return;
  }

  console.error("dev:check bloqueou a inicializacao para evitar ambiente fantasma.");
  if (suspicious.length > 0) {
    console.error("\nProcessos Next/API suspeitos:");
    for (const item of suspicious) {
      console.error(`- pid=${item.pid} name=${item.name} command=${item.command}`);
    }
  }
  if (conflicts.length > 0) {
    console.error("\nPortas em uso:");
    for (const item of conflicts) {
      console.error(`- port=${item.port} pid=${item.pid} address=${item.address}`);
    }
  }
  console.error("\nEncerrar o processo antigo de forma controlada ou ajustar DEV_CHECK_PORTS.");
  process.exitCode = 1;
}

if (resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1] || "")) {
  main();
}
