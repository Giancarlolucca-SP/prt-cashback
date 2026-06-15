#!/usr/bin/env node

import { chromium } from "playwright-core";

const apiBaseUrl = process.env.QA_API_URL || "http://localhost:3333";
const webBaseUrl = process.env.QA_WEB_URL || "http://localhost:3000";
const email = process.env.QA_SELLER_EMAIL || "vendedor@gt3.local";
const password = process.env.QA_PASSWORD || "Gt3@2026dev";
const edgePath = process.env.QA_BROWSER_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

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

async function prepareLead(token) {
  const leadTitle = `QA Historico Lead ${runId}`;
  const leadResponse = await authedJson("/leads", token, {
    method: "POST",
    body: JSON.stringify({
      interest: "Civic Touring QA",
      nextActionAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      source: "QA Lead History",
      status: "NEW",
      temperature: 100,
      title: leadTitle,
    }),
  });

  const lead = leadResponse.data;
  assert(lead?.id, "lead creation did not return id");

  await authedJson(`/leads/${lead.id}/stage`, token, {
    method: "POST",
    body: JSON.stringify({
      reason: "Contato inicial validado pelo QA do historico",
      toStage: "CONTACTED",
    }),
  });

  await authedJson(`/leads/${lead.id}/follow-ups`, token, {
    method: "POST",
    body: JSON.stringify({
      dueAt: new Date(Date.now() + 30 * 60 * 60 * 1000).toISOString(),
      notes: "Follow-up criado para validar modal de historico do lead",
      type: `Retorno QA historico ${runId}`,
    }),
  });

  const startsAt = new Date(Date.now() + 54 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
  await authedJson("/appointments", token, {
    method: "POST",
    body: JSON.stringify({
      endsAt: endsAt.toISOString(),
      leadId: lead.id,
      notes: "Agenda criada para validar historico do lead",
      startsAt: startsAt.toISOString(),
      title: `Agenda QA historico ${runId}`,
      type: "Visita loja",
    }),
  });

  return { leadId: lead.id, leadTitle };
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

async function main() {
  const ready = await request("/health/ready");
  assert(ready.status === 200, `/health/ready returned ${ready.status}`);

  const token = await loginApi();
  const { leadId, leadTitle } = await prepareLead(token);

  const browser = await chromium.launch({
    executablePath: edgePath,
    headless: true,
  });
  const checks = [];

  try {
    const page = await browser.newPage({ viewport: { height: 900, width: 1440 } });
    await loginWeb(page);
    await page.goto(`${webBaseUrl}/leads`, { waitUntil: "networkidle" });

    const leadRow = page.locator("article.lead-row").filter({ hasText: leadTitle }).first();
    await leadRow.waitFor({ state: "visible", timeout: 15000 });
    checks.push(["leadVisible", leadTitle]);

    await leadRow.getByRole("button", { name: "Historico" }).click();

    const dialog = page.getByRole("dialog", { name: "Historico do lead" });
    await dialog.waitFor({ state: "visible", timeout: 10000 });
    await dialog.getByText(leadTitle).waitFor({ state: "visible", timeout: 10000 });
    await dialog.getByText("Contato feito").first().waitFor({ state: "visible", timeout: 10000 });
    await dialog.getByText(`Retorno QA historico ${runId}`).first().waitFor({ state: "visible", timeout: 10000 });
    await dialog.getByText(`Agenda QA historico ${runId}`).first().waitFor({ state: "visible", timeout: 10000 });
    checks.push(["historyModalLoaded", leadId]);

    await dialog.getByRole("button", { name: "Fechar historico do lead" }).click();
    await dialog.waitFor({ state: "hidden", timeout: 10000 });
    checks.push(["historyModalClosed", "ok"]);

    await page.close();
  } finally {
    await browser.close();
  }

  console.log("qa:lead-history:local ok");
  for (const [label, value] of checks) {
    console.log(`- ${label}: ${value}`);
  }
}

main().catch((error) => {
  console.error("qa:lead-history:local failed");
  console.error(error.message);
  process.exitCode = 1;
});
