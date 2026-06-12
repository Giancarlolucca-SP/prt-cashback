#!/usr/bin/env node

const apiBaseUrl = process.env.QA_API_URL || "http://localhost:3333";
const webBaseUrl = process.env.QA_WEB_URL || "http://localhost:3000";
const email = process.env.QA_APPRAISER_EMAIL || "avaliador@gt3.local";
const password = process.env.QA_PASSWORD || "Gt3@2026dev";
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

async function expectStatus(path, token, expectedStatus, options = {}) {
  const response = await request(path, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  assert(response.status === expectedStatus, `${path} expected ${expectedStatus}, got ${response.status}`);
}

async function main() {
  const checks = [];

  const ready = await request("/health/ready");
  assert(ready.status === 200, `/health/ready returned ${ready.status}`);
  checks.push(["readiness", "ok"]);

  const { body: login, response: loginResponse } = await requestJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  assert(loginResponse.status === 200, `appraiser login returned ${loginResponse.status}`);
  assert(login?.token, "appraiser login did not return token");
  assert(login.user?.role === "APPRAISER", `expected APPRAISER, got ${login.user?.role}`);
  const token = login.token;
  checks.push(["appraiser", login.user.email]);

  const inventory = await authedJson("/inventory?page=1&page_size=5", token);
  assert(Array.isArray(inventory.items), "inventory did not return items");
  checks.push(["inventoryRead", inventory.items.length]);

  const purchaseLead = await authedJson("/purchases/leads", token, {
    method: "POST",
    body: JSON.stringify({
      askingPrice: 72000,
      source: `QA Veiculos ${runId}`,
      status: "OPEN",
    }),
  });
  assert(purchaseLead.data?.id, "purchase lead did not return id");
  checks.push(["purchaseLead", purchaseLead.data.status]);

  const evaluatingLead = await authedJson(`/purchases/leads/${purchaseLead.data.id}/status`, token, {
    method: "POST",
    body: JSON.stringify({
      reason: "Avaliacao iniciada pelo QA de veiculos",
      status: "EVALUATING",
    }),
  });
  assert(evaluatingLead.data?.status === "EVALUATING", `purchase lead status expected EVALUATING, got ${evaluatingLead.data?.status}`);
  checks.push(["purchaseLeadStatus", evaluatingLead.data.status]);

  const evaluation = await authedJson("/purchases/evaluations", token, {
    method: "POST",
    body: JSON.stringify({
      decision: "NEGOTIATING",
      expectedMargin: 8500,
      expectedPrepCost: 2200,
      fipeValue: 76000,
      purchaseLeadId: purchaseLead.data.id,
      requestedPrice: 72000,
      snapshot: {
        source: "qa-vehicles-local",
        runId,
      },
      suggestedPrice: 69000,
    }),
  });
  assert(evaluation.data?.id, "evaluation did not return id");
  assert(evaluation.data.purchaseLeadId === purchaseLead.data.id, "evaluation is not linked to purchase lead");
  checks.push(["evaluation", evaluation.data.decision]);

  const checklist = await authedJson(`/purchases/evaluations/${evaluation.data.id}/checklist`, token, {
    method: "POST",
    body: JSON.stringify({
      itemKey: "documentacao",
      label: "Documentacao conferida",
      metadata: {
        source: "qa-vehicles-local",
      },
      value: "ok",
    }),
  });
  assert(checklist.data?.id, "evaluation checklist did not return id");
  checks.push(["evaluationChecklist", checklist.data.itemKey]);

  const details = await authedJson(`/purchases/evaluations/${evaluation.data.id}`, token);
  assert(details.data?.id === evaluation.data.id, "evaluation details did not return evaluation");
  assert(details.checklist.some((item) => item.id === checklist.data.id), "evaluation details do not include checklist item");
  checks.push(["evaluationDetailsChecklist", details.checklist.length]);

  await expectStatus(`/purchases/evaluations/${evaluation.data.id}/approval`, token, 403, {
    method: "POST",
    body: JSON.stringify({
      reason: "Avaliador nao deve aprovar sozinho no QA",
      status: "APPROVED",
    }),
  });
  checks.push(["approvalBlocked", "ok"]);

  await expectStatus("/finance/summary", token, 403);
  await expectStatus("/audit/logs?page=1&page_size=5", token, 403);
  await expectStatus("/users?page=1&page_size=5", token, 403);
  await expectStatus("/sales?page=1&page_size=5", token, 403);
  checks.push(["sensitiveBlocks", "finance,audit,users,sales"]);

  for (const route of ["/compras", "/avaliacoes", "/estoque"]) {
    const response = await fetch(`${webBaseUrl}${route}`);
    assert(response.ok, `${route} returned ${response.status}`);
  }
  checks.push(["webVehicleRoutes", 3]);

  console.log("qa:vehicles:local ok");
  for (const [label, value] of checks) {
    console.log(`- ${label}: ${value}`);
  }
}

main().catch((error) => {
  console.error("qa:vehicles:local failed");
  console.error(error.message);
  process.exitCode = 1;
});
