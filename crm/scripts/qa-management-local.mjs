#!/usr/bin/env node

const apiBaseUrl = process.env.QA_API_URL || "http://localhost:3333";
const webBaseUrl = process.env.QA_WEB_URL || "http://localhost:3000";
const email = process.env.QA_MANAGEMENT_EMAIL || "dono@gt3.local";
const password = process.env.QA_PASSWORD || "Gt3@2026dev";
const runId = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const qaUserPassword = `QaGestao${runId}!`;

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

async function expectStatus(path, token, expectedStatus) {
  const response = await request(path, {
    headers: { authorization: `Bearer ${token}` },
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
  assert(loginResponse.status === 200, `management login returned ${loginResponse.status}`);
  assert(login?.token, "management login did not return token");
  assert(login.user?.role === "OWNER_MANAGER", `expected OWNER_MANAGER, got ${login.user?.role}`);
  const token = login.token;
  checks.push(["management", login.user.email]);

  const executive = await authedJson("/analytics/executive-summary", token);
  assert(executive.totals, "executive summary did not return totals");
  assert(Array.isArray(executive.revenueSeries), "executive summary did not return revenue series");
  checks.push(["executiveSummary", "ok"]);

  const salesFunnel = await authedJson("/analytics/sales-funnel", token);
  assert(salesFunnel.leadsByStatus, "sales funnel did not return leads by status");
  assert(salesFunnel.salesByStatus, "sales funnel did not return sales by status");
  checks.push(["salesFunnelStatuses", Object.keys(salesFunnel.leadsByStatus).length]);

  const inventory = await authedJson("/analytics/inventory-performance", token);
  assert(inventory.inventoryByStatus, "inventory performance did not return inventory by status");
  assert(inventory.inventoryValue, "inventory performance did not return inventory value");
  checks.push(["inventoryPerformance", "ok"]);

  const financeBefore = await authedJson("/finance/summary", token);
  assert(financeBefore.totals, "finance summary did not return totals");
  checks.push(["financeSummaryBefore", financeBefore.totals.net ?? "ok"]);

  const transaction = await authedJson("/finance/transactions", token, {
    method: "POST",
    body: JSON.stringify({
      type: "EXPENSE",
      status: "PENDING",
      description: `QA Gestao despesa ${runId}`,
      amount: 123.45,
      dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      snapshot: {
        source: "qa-management-local",
        runId,
      },
    }),
  });
  assert(transaction.data?.id, "financial transaction did not return id");
  checks.push(["transactionCreated", transaction.data.status]);

  const settled = await authedJson(`/finance/transactions/${transaction.data.id}/settle`, token, {
    method: "POST",
    body: JSON.stringify({
      status: "PAID",
      paidAt: new Date().toISOString(),
      reason: "Baixa automatizada pelo QA de gestao",
    }),
  });
  assert(settled.data?.status === "PAID", `transaction status expected PAID, got ${settled.data?.status}`);
  checks.push(["transactionSettled", settled.data.status]);

  const transactionDetails = await authedJson(`/finance/transactions/${transaction.data.id}`, token);
  assert(transactionDetails.data?.id === transaction.data.id, "financial transaction details did not return created transaction");
  checks.push(["transactionDetails", transactionDetails.data.amount]);

  const storeSetting = await authedJson(`/settings/store-settings/qa_management_${runId}`, token, {
    method: "PUT",
    body: JSON.stringify({
      value: {
        enabled: true,
        source: "qa-management-local",
        runId,
      },
    }),
  });
  assert(storeSetting.data?.key === `qa_management_${runId}`, "store setting did not persist key");
  checks.push(["storeSetting", storeSetting.data.key]);

  const birthdaySetting = await authedJson("/settings/customer-birthday-notifications", token, {
    method: "PUT",
    body: JSON.stringify({
      daysBefore: 5,
      enabled: true,
      channel: "EMAIL",
    }),
  });
  assert(birthdaySetting.data?.value?.daysBefore === 5, "birthday notification setting did not persist daysBefore");
  checks.push(["birthdayNotifications", birthdaySetting.data.value.channel]);

  const category = await authedJson("/settings/categories", token, {
    method: "POST",
    body: JSON.stringify({
      domain: "qa_management",
      name: `Categoria Gestao ${runId}`,
      metadata: {
        source: "qa-management-local",
      },
      status: "ACTIVE",
    }),
  });
  assert(category.data?.id, "configurable category did not return id");
  checks.push(["category", category.data.status]);

  const documentTemplate = await authedJson("/settings/document-templates", token, {
    method: "POST",
    body: JSON.stringify({
      name: `Contrato QA Gestao ${runId}`,
      module: "sales",
      content: "Template QA sem URLs remotas para validar bloqueio de rastreadores.",
      snapshot: {
        source: "qa-management-local",
      },
    }),
  });
  assert(documentTemplate.data?.id, "document template did not return id");
  checks.push(["documentTemplate", documentTemplate.data.version]);

  const messageTemplate = await authedJson("/settings/message-templates", token, {
    method: "POST",
    body: JSON.stringify({
      name: `Mensagem QA Gestao ${runId}`,
      channel: "EMAIL",
      content: "Mensagem QA sem imagens remotas.",
      variables: {
        cliente: "nome",
      },
    }),
  });
  assert(messageTemplate.data?.id, "message template did not return id");
  checks.push(["messageTemplate", messageTemplate.data.version]);

  const operationalParameter = await authedJson(`/settings/operational-parameters/qa_management_${runId}`, token, {
    method: "PUT",
    body: JSON.stringify({
      value: {
        lockoutMinutes: 15,
        source: "qa-management-local",
      },
      snapshot: {
        runId,
      },
    }),
  });
  assert(operationalParameter.data?.key === `qa_management_${runId}`, "operational parameter did not persist key");
  checks.push(["operationalParameter", operationalParameter.data.key]);

  const qaUserEmail = `qa.gestao.${runId}@example.test`;
  const user = await authedJson("/users", token, {
    method: "POST",
    body: JSON.stringify({
      name: `QA Gestao ${runId}`,
      email: qaUserEmail,
      role: "SELLER",
      password: qaUserPassword,
      mustChangePassword: false,
      isActive: true,
    }),
  });
  assert(user.data?.id, "created user did not return id");
  checks.push(["userCreated", user.data.role]);

  const { body: createdUserLogin, response: createdUserLoginResponse } = await requestJson("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: qaUserEmail, password: qaUserPassword }),
  });
  assert(createdUserLoginResponse.status === 200, `created user login returned ${createdUserLoginResponse.status}`);
  assert(createdUserLogin?.token, "created user login did not return token");
  checks.push(["createdUserSession", "ok"]);

  const permissionOverride = await authedJson(`/users/${user.data.id}/permissions`, token, {
    method: "POST",
    body: JSON.stringify({
      module: "finance",
      action: "read",
      scope: "ALL",
      sensitiveArea: "financial",
      effect: "DENY",
    }),
  });
  assert(permissionOverride.data?.id, "permission override did not return id");
  checks.push(["permissionOverride", permissionOverride.data.effect]);

  const permissionScope = await authedJson(`/users/${user.data.id}/scopes`, token, {
    method: "POST",
    body: JSON.stringify({
      module: "customers",
      scope: "OWN_PORTFOLIO",
    }),
  });
  assert(permissionScope.data?.id, "permission scope did not return id");
  checks.push(["permissionScope", permissionScope.data.scope]);

  const updatedUser = await authedJson(`/users/${user.data.id}`, token, {
    method: "PATCH",
    body: JSON.stringify({
      mustChangePassword: true,
      isActive: false,
    }),
  });
  assert(updatedUser.data?.isActive === false, "sensitive user update did not deactivate user");
  assert(updatedUser.data?.mustChangePassword === true, "sensitive user update did not force password change");
  checks.push(["userSensitiveUpdate", "sessionsRevoked"]);

  await expectStatus("/auth/me", createdUserLogin.token, 401);
  checks.push(["revokedSession", "401"]);

  const userDetails = await authedJson(`/users/${user.data.id}`, token);
  assert(userDetails.overrides.some((entry) => entry.id === permissionOverride.data.id), "user details do not include permission override");
  assert(userDetails.scopes.some((entry) => entry.id === permissionScope.data.id), "user details do not include permission scope");
  checks.push(["userDetails", `${userDetails.overrides.length}/${userDetails.scopes.length}`]);

  const auditSummary = await authedJson("/audit/summary", token);
  assert(auditSummary.auditByResult, "audit summary did not return audit result buckets");
  assert(auditSummary.technicalByLevel, "audit summary did not return technical event buckets");
  checks.push(["auditSummary", "ok"]);

  const auditLogs = await authedJson("/audit/logs?page=1&page_size=10", token);
  assert(Array.isArray(auditLogs.items), "audit logs did not return items");
  assert(auditLogs.items.length > 0, "audit logs should include recent QA operations");
  checks.push(["auditLogs", auditLogs.items.length]);

  const settingsSummary = await authedJson("/settings/summary", token);
  assert(settingsSummary.storeSettings.some((entry) => entry.key === storeSetting.data.key), "settings summary does not include store setting");
  assert(settingsSummary.operationalParameters.some((entry) => entry.key === operationalParameter.data.key), "settings summary does not include operational parameter");
  checks.push(["settingsSummary", "ok"]);

  const users = await authedJson("/users?page=1&page_size=20", token);
  assert(users.items.some((entry) => entry.id === user.data.id), "users list does not include created QA user");
  checks.push(["usersList", users.items.length]);

  for (const route of ["/resultados", "/financeiro", "/auditoria", "/configuracoes"]) {
    const response = await fetch(`${webBaseUrl}${route}`);
    assert(response.ok, `${route} returned ${response.status}`);
  }
  checks.push(["webManagementRoutes", 4]);

  console.log("qa:management:local ok");
  for (const [label, value] of checks) {
    console.log(`- ${label}: ${value}`);
  }
}

main().catch((error) => {
  console.error("qa:management:local failed");
  console.error(error.message);
  process.exitCode = 1;
});
