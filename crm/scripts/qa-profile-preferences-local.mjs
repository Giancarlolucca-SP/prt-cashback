#!/usr/bin/env node

import { chromium } from "playwright-core";

const apiBaseUrl = process.env.QA_API_URL || "http://localhost:3333";
const webBaseUrl = process.env.QA_WEB_URL || "http://localhost:3000";
const email = process.env.QA_EMAIL || "dono@gt3.local";
const password = process.env.QA_PASSWORD || "Gt3@2026dev";
const edgePath = process.env.QA_BROWSER_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const preferenceKey = "customer_history_timeline";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, options = {}) {
  return fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
}

async function requestJson(path, options = {}) {
  const response = await request(path, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { body, response };
}

async function authedJson(path, token, options = {}) {
  const { body, response } = await requestJson(path, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${JSON.stringify(body).slice(0, 240)}`);
  }

  return body;
}

async function loginApi() {
  const { body, response } = await requestJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert(response.status === 200, `login returned ${response.status}`);
  assert(body?.token, "login did not return token");
  return body.token;
}

async function loginWeb(page) {
  await page.goto(`${webBaseUrl}/login`, { waitUntil: "networkidle" });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
}

async function waitForCondition(label, callback, timeoutMs = 12000) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await callback()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`${label} timed out${lastError ? `: ${lastError.message}` : ""}`);
}

async function main() {
  const ready = await request("/health/ready");
  assert(ready.status === 200, `/health/ready returned ${ready.status}`);

  const token = await loginApi();
  await authedJson(`/auth/preferences/${preferenceKey}`, token, {
    method: "PUT",
    body: JSON.stringify({
      value: {
        filter: "appointment",
        search: "perfil qa",
      },
    }),
  });

  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: true,
  });
  const checks = [];

  try {
    const page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
    await loginWeb(page);
    await page.goto(`${webBaseUrl}/perfil`, { waitUntil: "networkidle" });

    await page.getByText("Timeline do cliente").waitFor({ state: "visible", timeout: 10000 });
    await page.getByText("filter: appointment").waitFor({ state: "visible", timeout: 10000 });
    checks.push(["preferenceListed", "Timeline do cliente"]);

    await page.locator(".profile-preference-row").filter({ hasText: "Timeline do cliente" }).getByRole("button", { name: /Limpar/i }).click();
    await waitForCondition("profile preference removed from UI", async () => (await page.getByText("Timeline do cliente").count()) === 0);

    const deletedPreference = await authedJson(`/auth/preferences/${preferenceKey}`, token);
    assert(deletedPreference.data?.value === null, "preference was not removed from backend");
    checks.push(["preferenceCleared", "ok"]);

    await page.close();
  } finally {
    await browser.close();
  }

  console.log("qa:profile-preferences:local ok");
  for (const [label, value] of checks) {
    console.log(`- ${label}: ${value}`);
  }
}

main().catch((error) => {
  console.error("qa:profile-preferences:local failed");
  console.error(error.message);
  process.exitCode = 1;
});
