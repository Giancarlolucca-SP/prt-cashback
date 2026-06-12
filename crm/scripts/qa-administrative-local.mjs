#!/usr/bin/env node

const apiBaseUrl = process.env.QA_API_URL || "http://localhost:3333";
const webBaseUrl = process.env.QA_WEB_URL || "http://localhost:3000";
const email = process.env.QA_ADMINISTRATIVE_EMAIL || "administrativo@gt3.local";
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
  assert(loginResponse.status === 200, `administrative login returned ${loginResponse.status}`);
  assert(login?.token, "administrative login did not return token");
  assert(login.user?.role === "ADMINISTRATIVE", `expected ADMINISTRATIVE, got ${login.user?.role}`);
  const token = login.token;
  checks.push(["administrative", login.user.email]);

  const customer = await authedJson("/customers", token, {
    method: "POST",
    body: JSON.stringify({
      email: `qa.adm.${runId}@example.test`,
      name: `QA Administrativo ${runId}`,
      origin: "QA Administrativo",
      phone: `1197${runId.slice(-8)}`,
    }),
  });
  assert(customer.data?.id, "customer did not return id");
  checks.push(["customer", customer.data.status]);

  const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const appointment = await authedJson("/appointments", token, {
    method: "POST",
    body: JSON.stringify({
      customerId: customer.data.id,
      startsAt: startsAt.toISOString(),
      title: `Atendimento administrativo QA ${runId}`,
      type: "Administrativo",
    }),
  });
  assert(appointment.data?.id, "appointment did not return id");
  assert(appointment.data.customerId === customer.data.id, "appointment is not linked to customer");
  checks.push(["appointment", appointment.data.status]);

  const sale = await authedJson("/sales", token, {
    method: "POST",
    body: JSON.stringify({
      customerId: customer.data.id,
      salePrice: 48500,
      status: "DRAFT",
      type: "REPASSE",
    }),
  });
  assert(sale.data?.id, "repasse sale did not return id");
  assert(sale.data.type === "REPASSE", `sale type expected REPASSE, got ${sale.data.type}`);
  checks.push(["repasseSale", sale.data.status]);

  const proposal = await authedJson(`/sales/${sale.data.id}/status`, token, {
    method: "POST",
    body: JSON.stringify({
      reason: "Venda de repasse enviada para triagem administrativa",
      status: "DOCUMENTATION",
    }),
  });
  assert(proposal.data?.status === "DOCUMENTATION", `sale status expected DOCUMENTATION, got ${proposal.data?.status}`);
  checks.push(["repasseSaleStage", proposal.data.status]);

  const contract = await authedJson("/contracts/generate", token, {
    method: "POST",
    body: JSON.stringify({
      saleId: sale.data.id,
      snapshot: {
        source: "qa-administrative-local",
      },
      status: "GENERATED",
    }),
  });
  assert(contract.data?.id, "contract did not return id");
  assert(contract.data.saleId === sale.data.id, "contract is not linked to sale");
  checks.push(["contract", contract.data.status]);

  const provider = await authedJson("/services/providers", token, {
    method: "POST",
    body: JSON.stringify({
      contactName: "Contato QA",
      name: `Prestador QA Administrativo ${runId}`,
      phone: `1196${runId.slice(-8)}`,
      serviceTypes: ["Preparacao", "Vistoria"],
      accessSecretRef: `vault://qa/admin/${runId}`,
    }),
  });
  assert(provider.data?.id, "provider did not return id");
  checks.push(["provider", provider.data.status ?? "created"]);

  const postSaleCustomer = await authedJson("/services/post-sale/customers", token, {
    method: "POST",
    body: JSON.stringify({
      customerId: customer.data.id,
      name: customer.data.name,
      phone: customer.data.phone,
      recurrenceStatus: "QA",
      totalRevenue: 0,
      vehicleInfo: "Repasse QA",
    }),
  });
  assert(postSaleCustomer.data?.id, "post-sale customer did not return id");
  checks.push(["postSaleCustomer", postSaleCustomer.data.status]);

  const order = await authedJson("/services/orders", token, {
    method: "POST",
    body: JSON.stringify({
      customerId: customer.data.id,
      postSaleCustomerId: postSaleCustomer.data.id,
      providerId: provider.data.id,
      status: "OPEN",
      totalAmount: 980,
      type: "Preparacao QA",
    }),
  });
  assert(order.data?.id, "service order did not return id");
  checks.push(["serviceOrder", order.data.status]);

  const orderItem = await authedJson(`/services/orders/${order.data.id}/items`, token, {
    method: "POST",
    body: JSON.stringify({
      costAmount: 320,
      description: "Preparacao estetica QA",
      quantity: 1,
      unitPrice: 980,
    }),
  });
  assert(orderItem.data?.id, "service order item did not return id");
  checks.push(["serviceOrderItem", orderItem.data.quantity]);

  const cost = await authedJson(`/services/orders/${order.data.id}/costs`, token, {
    method: "POST",
    body: JSON.stringify({
      amount: 320,
      description: "Custo prestador QA",
      providerId: provider.data.id,
    }),
  });
  assert(cost.data?.id, "service cost did not return id");
  checks.push(["serviceCost", cost.data.amount]);

  const invoice = await authedJson(`/services/orders/${order.data.id}/invoices`, token, {
    method: "POST",
    body: JSON.stringify({
      amount: 320,
      number: `QA-${runId}`,
      providerId: provider.data.id,
      snapshot: {
        source: "qa-administrative-local",
      },
    }),
  });
  assert(invoice.data?.id, "service invoice did not return id");
  checks.push(["serviceInvoice", invoice.data.amount]);

  const waitingInvoice = await authedJson(`/services/orders/${order.data.id}/status`, token, {
    method: "POST",
    body: JSON.stringify({
      reason: "Aguardando conferencia da nota QA",
      status: "WAITING_INVOICE",
    }),
  });
  assert(waitingInvoice.data?.status === "WAITING_INVOICE", `order status expected WAITING_INVOICE, got ${waitingInvoice.data?.status}`);
  checks.push(["serviceOrderStatus", waitingInvoice.data.status]);

  const providersList = await authedJson("/services/providers?page=1&page_size=10", token);
  assert(providersList.items.some((item) => item.id === provider.data.id), "providers list does not include created provider");
  const sanitizedProvider = providersList.items.find((item) => item.id === provider.data.id);
  assert(sanitizedProvider.hasSecret === true, "provider secret reference should be masked as hasSecret");
  assert(!("accessSecretRef" in sanitizedProvider), "provider list exposed accessSecretRef");
  checks.push(["providerSecretMask", "ok"]);

  const contracts = await authedJson("/contracts?page=1&page_size=20", token);
  assert(contracts.items.some((item) => item.id === contract.data.id && !item.signedAt), "contracts list does not include generated unsigned contract");
  checks.push(["unsignedContractInTriage", "ok"]);

  await expectStatus("/audit/logs?page=1&page_size=5", token, 403);
  await expectStatus("/users?page=1&page_size=5", token, 403);
  checks.push(["sensitiveBlocks", "audit,users"]);

  for (const route of ["/administrativo", "/fornecedores", "/servicos", "/vendas", "/documentos"]) {
    const response = await fetch(`${webBaseUrl}${route}`);
    assert(response.ok, `${route} returned ${response.status}`);
  }
  checks.push(["webAdministrativeRoutes", 5]);

  console.log("qa:administrative:local ok");
  for (const [label, value] of checks) {
    console.log(`- ${label}: ${value}`);
  }
}

main().catch((error) => {
  console.error("qa:administrative:local failed");
  console.error(error.message);
  process.exitCode = 1;
});
