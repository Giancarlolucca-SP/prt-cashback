#!/usr/bin/env node

const apiBaseUrl = process.env.QA_API_URL || "http://localhost:3333";
const webBaseUrl = process.env.QA_WEB_URL || "http://localhost:3000";
const email = process.env.QA_SERVICES_EMAIL || "servicos@gt3.local";
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
  assert(loginResponse.status === 200, `services login returned ${loginResponse.status}`);
  assert(login?.token, "services login did not return token");
  assert(login.user?.role === "SERVICE_MANAGER", `expected SERVICE_MANAGER, got ${login.user?.role}`);
  const token = login.token;
  checks.push(["services", login.user.email]);

  const postSaleCustomer = await authedJson("/services/post-sale/customers", token, {
    method: "POST",
    body: JSON.stringify({
      email: `qa.servicos.${runId}@example.test`,
      name: `QA Pos-venda ${runId}`,
      nextActionAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      phone: `1195${runId.slice(-8)}`,
      recurrenceStatus: "QA",
      totalRevenue: 0,
      vehicleInfo: "Civic QA pos-venda",
    }),
  });
  assert(postSaleCustomer.data?.id, "post-sale customer did not return id");
  checks.push(["postSaleCustomer", postSaleCustomer.data.status]);

  const provider = await authedJson("/services/providers", token, {
    method: "POST",
    body: JSON.stringify({
      contactName: "Contato Servicos QA",
      name: `Prestador Servicos QA ${runId}`,
      phone: `1194${runId.slice(-8)}`,
      serviceTypes: ["Lavagem", "Polimento"],
    }),
  });
  assert(provider.data?.id, "provider did not return id");
  checks.push(["provider", provider.data.status ?? "created"]);

  const catalog = await authedJson("/services/catalog", token, {
    method: "POST",
    body: JSON.stringify({
      basePrice: 780,
      category: "Estetica",
      name: `Polimento QA ${runId}`,
      slaHours: 24,
    }),
  });
  assert(catalog.data?.id, "catalog item did not return id");
  checks.push(["catalog", catalog.data.category]);

  const order = await authedJson("/services/orders", token, {
    method: "POST",
    body: JSON.stringify({
      postSaleCustomerId: postSaleCustomer.data.id,
      providerId: provider.data.id,
      startedAt: new Date().toISOString(),
      status: "OPEN",
      totalAmount: 780,
      type: "Polimento QA",
    }),
  });
  assert(order.data?.id, "service order did not return id");
  assert(order.data.postSaleCustomerId === postSaleCustomer.data.id, "order is not linked to post-sale customer");
  checks.push(["serviceOrder", order.data.status]);

  const scheduled = await authedJson(`/services/orders/${order.data.id}/status`, token, {
    method: "POST",
    body: JSON.stringify({
      reason: "Agendado pelo QA de servicos",
      status: "SCHEDULED",
    }),
  });
  assert(scheduled.data?.status === "SCHEDULED", `order status expected SCHEDULED, got ${scheduled.data?.status}`);
  checks.push(["serviceOrderScheduled", scheduled.data.status]);

  const item = await authedJson(`/services/orders/${order.data.id}/items`, token, {
    method: "POST",
    body: JSON.stringify({
      catalogItemId: catalog.data.id,
      costAmount: 260,
      description: "Polimento completo QA",
      quantity: 1,
      unitPrice: 780,
    }),
  });
  assert(item.data?.id, "service item did not return id");
  checks.push(["serviceItem", item.data.quantity]);

  const cost = await authedJson(`/services/orders/${order.data.id}/costs`, token, {
    method: "POST",
    body: JSON.stringify({
      amount: 260,
      description: "Custo prestador servicos QA",
      providerId: provider.data.id,
    }),
  });
  assert(cost.data?.id, "service cost did not return id");
  checks.push(["serviceCost", cost.data.amount]);

  const invoice = await authedJson(`/services/orders/${order.data.id}/invoices`, token, {
    method: "POST",
    body: JSON.stringify({
      amount: 260,
      number: `SERV-QA-${runId}`,
      providerId: provider.data.id,
      snapshot: {
        source: "qa-services-local",
      },
    }),
  });
  assert(invoice.data?.id, "service invoice did not return id");
  checks.push(["serviceInvoice", invoice.data.amount]);

  const done = await authedJson(`/services/orders/${order.data.id}/status`, token, {
    method: "POST",
    body: JSON.stringify({
      reason: "Servico concluido pelo QA",
      status: "DONE",
    }),
  });
  assert(done.data?.status === "DONE", `order status expected DONE, got ${done.data?.status}`);
  assert(done.data.finishedAt, "done service order should have finishedAt");
  checks.push(["serviceOrderDone", done.data.status]);

  const details = await authedJson(`/services/orders/${order.data.id}`, token);
  assert(details.data?.id === order.data.id, "order details did not return order");
  assert(details.items.some((entry) => entry.id === item.data.id), "order details do not include item");
  assert(details.costs.some((entry) => entry.id === cost.data.id), "order details do not include cost");
  assert(details.invoices.some((entry) => entry.id === invoice.data.id), "order details do not include invoice");
  checks.push(["serviceOrderDetails", `${details.items.length}/${details.costs.length}/${details.invoices.length}`]);

  const postSaleList = await authedJson("/services/post-sale/customers?page=1&page_size=20", token);
  assert(postSaleList.items.some((entry) => entry.id === postSaleCustomer.data.id), "post-sale list does not include created customer");
  checks.push(["postSaleList", "ok"]);

  await expectStatus("/finance/summary", token, 403);
  await expectStatus("/audit/logs?page=1&page_size=5", token, 403);
  await expectStatus("/users?page=1&page_size=5", token, 403);
  checks.push(["sensitiveBlocks", "finance,audit,users"]);

  for (const route of ["/servicos", "/fornecedores", "/pos-venda", "/agendamentos"]) {
    const response = await fetch(`${webBaseUrl}${route}`);
    assert(response.ok, `${route} returned ${response.status}`);
  }
  checks.push(["webServiceRoutes", 4]);

  console.log("qa:services:local ok");
  for (const [label, value] of checks) {
    console.log(`- ${label}: ${value}`);
  }
}

main().catch((error) => {
  console.error("qa:services:local failed");
  console.error(error.message);
  process.exitCode = 1;
});
