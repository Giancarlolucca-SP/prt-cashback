#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);

const forbiddenTrackedFilePatterns = [
  /(^|\/)\.env$/,
  /(^|\/)\.env\.(?!example$).+/,
  /(^|\/).*\.env\.bak$/,
];

const contentPatterns = [
  { name: "private key", pattern: /-----BEGIN (RSA |EC |OPENSSH |PRIVATE )?PRIVATE KEY-----/ },
  { name: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
  { name: "GitHub token", pattern: /(ghp_[0-9A-Za-z]{36}|github_pat_[0-9A-Za-z_]+)/ },
  { name: "Stripe live key", pattern: /sk_live_[0-9A-Za-z]+/ },
  { name: "Stripe concrete test key", pattern: /sk_test_[0-9A-Za-z]{10,}/ },
  { name: "SendGrid key", pattern: /SG\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  { name: "hardcoded Evolution API key", pattern: /postocash-evo-2026/ },
  {
    name: "database URL with embedded credentials",
    pattern: /postgres(?:ql)?:\/\/(?!crm_user:crm_password@localhost)(?!USER:PASSWORD@localhost)[^<\s"'`:@]+:[^<\s"'`@]+@[^<\s"'`]+/i,
  },
];

const offenders = [];

for (const file of trackedFiles) {
  if (forbiddenTrackedFilePatterns.some((pattern) => pattern.test(file))) {
    offenders.push(`${file}: forbidden env-like file is tracked`);
    continue;
  }

  if (/\.(png|jpg|jpeg|webp|ico|pdf|lock)$/i.test(file)) {
    continue;
  }

  let content = "";
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }

  for (const { name, pattern } of contentPatterns) {
    if (pattern.test(content)) {
      offenders.push(`${file}: ${name}`);
    }
  }
}

if (offenders.length > 0) {
  console.error("Potential committed secrets found:");
  for (const offender of offenders) {
    console.error(`- ${offender}`);
  }
  process.exit(1);
}

console.log("No committed secrets detected.");
