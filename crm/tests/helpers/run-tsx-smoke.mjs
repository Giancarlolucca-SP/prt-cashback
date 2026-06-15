import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export function runTsxSmoke(scriptPath, env = {}) {
  execFileSync(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), scriptPath], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}
