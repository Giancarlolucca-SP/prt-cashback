import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function loadDotEnv() {
  const envPath = resolve(".env");
  if (!existsSync(envPath)) {
    return;
  }

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

loadDotEnv();

function postgresToolUrl(rawUrl) {
  const url = new URL(rawUrl);
  for (const param of ["schema", "pgbouncer", "connection_limit"]) {
    url.searchParams.delete(param);
  }
  return url.toString();
}

function resolvePostgresBinary(commandName) {
  const binaryName = process.platform === "win32" ? `${commandName}.exe` : commandName;
  if (process.env.POSTGRES_BIN_DIR) {
    const candidate = join(process.env.POSTGRES_BIN_DIR, binaryName);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  if (process.platform === "win32") {
    const baseDir = "C:\\Program Files\\PostgreSQL";
    if (existsSync(baseDir)) {
      const versions = readdirSync(baseDir).sort().reverse();
      for (const version of versions) {
        const candidate = join(baseDir, version, "bin", binaryName);
        if (existsSync(candidate)) {
          return candidate;
        }
      }
    }
  }

  return binaryName;
}

const databaseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const backupFile = process.env.BACKUP_FILE ? resolve(process.env.BACKUP_FILE) : null;

if (process.env.ALLOW_RESTORE !== "true") {
  console.error("Restore bloqueado. Defina ALLOW_RESTORE=true para confirmar a operacao.");
  process.exit(1);
}

if (!databaseUrl) {
  console.error("DATABASE_URL ou DIRECT_URL deve estar configurada para restaurar backup.");
  process.exit(1);
}

if (!backupFile || !existsSync(backupFile)) {
  console.error("Defina BACKUP_FILE com o caminho de um arquivo .dump existente.");
  process.exit(1);
}

const result = spawnSync(
  resolvePostgresBinary("pg_restore"),
  ["--clean", "--if-exists", "--no-owner", "--dbname", postgresToolUrl(databaseUrl), backupFile],
  {
    stdio: "inherit",
  },
);

if (result.status !== 0) {
  console.error("Restore falhou. Verifique se pg_restore esta no PATH e se o banco alvo esta correto.");
  process.exit(result.status ?? 1);
}

console.log("Restore concluido.");
