#!/usr/bin/env node

const apiBaseUrl = process.env.QA_API_URL || "http://localhost:3333";
const webBaseUrl = process.env.QA_WEB_URL || "http://localhost:3000";
const email = process.env.QA_SELLER_EMAIL || "vendedor@gt3.local";
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
  assert(loginResponse.status === 200, `seller login returned ${loginResponse.status}`);
  assert(login?.token, "seller login did not return token");
  assert(login.user?.role === "SELLER", `expected SELLER, got ${login.user?.role}`);
  const token = login.token;
  checks.push(["seller", login.user.email]);

  const customerName = `QA Comercial ${runId}`;
  const customerEmail = `qa.comercial.${runId}@example.test`;
  const customerPhone = `1198${runId.slice(-8)}`;

  const minimalLead = await authedJson("/customers/minimal-leads", token, {
    method: "POST",
    body: JSON.stringify({
      email: customerEmail,
      interest: "Civic Touring QA",
      name: customerName,
      notes: "Fluxo comercial QA automatizado",
      origin: "QA Comercial",
      phone: customerPhone,
    }),
  });
  const customer = minimalLead.data?.customer;
  const lead = minimalLead.data?.lead;
  assert(customer?.id, "minimal lead did not return customer id");
  assert(lead?.id, "minimal lead did not return lead id");
  assert(lead.customerId === customer.id, "lead is not linked to created customer");
  checks.push(["minimalLead", lead.status]);

  const movedLead = await authedJson(`/leads/${lead.id}/stage`, token, {
    method: "POST",
    body: JSON.stringify({
      reason: "Contato realizado pelo QA comercial",
      toStage: "CONTACTED",
    }),
  });
  assert(movedLead.data?.status === "CONTACTED", `lead stage expected CONTACTED, got ${movedLead.data?.status}`);
  checks.push(["leadStage", movedLead.data.status]);

  const movedCustomer = await authedJson(`/customers/${customer.id}/kanban-status`, token, {
    method: "POST",
    body: JSON.stringify({
      reason: "Cliente agendado no fluxo QA comercial",
      toStatus: "SCHEDULED",
    }),
  });
  assert(movedCustomer.data?.operationalStatus === "SCHEDULED", `customer status expected SCHEDULED, got ${movedCustomer.data?.operationalStatus}`);
  checks.push(["customerKanban", movedCustomer.data.operationalStatus]);

  const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endsAt = new Date(startsAt.getTime() + 45 * 60 * 1000);
  const appointment = await authedJson("/appointments", token, {
    method: "POST",
    body: JSON.stringify({
      customerId: customer.id,
      leadId: lead.id,
      notes: "Agendamento criado pelo QA comercial",
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      title: `Visita QA ${runId}`,
      type: "Visita loja",
    }),
  });
  assert(appointment.data?.id, "appointment did not return id");
  assert(appointment.data.customerId === customer.id, "appointment is not linked to customer");
  assert(appointment.data.leadId === lead.id, "appointment is not linked to lead");
  checks.push(["appointment", appointment.data.status]);

  const confirmedAppointment = await authedJson(`/appointments/${appointment.data.id}/status`, token, {
    method: "POST",
    body: JSON.stringify({
      reason: "Confirmado pelo QA comercial",
      status: "CONFIRMED",
    }),
  });
  assert(confirmedAppointment.data?.status === "CONFIRMED", `appointment status expected CONFIRMED, got ${confirmedAppointment.data?.status}`);
  checks.push(["appointmentStatus", confirmedAppointment.data.status]);

  const sale = await authedJson("/sales", token, {
    method: "POST",
    body: JSON.stringify({
      customerId: customer.id,
      salePrice: 125000,
      status: "DRAFT",
      type: "VEHICLE",
    }),
  });
  assert(sale.data?.id, "sale did not return id");
  assert(sale.data.customerId === customer.id, "sale is not linked to customer");
  assert(sale.data.status === "DRAFT", `sale status expected DRAFT, got ${sale.data.status}`);
  checks.push(["saleDraft", sale.data.status]);

  const proposedSale = await authedJson(`/sales/${sale.data.id}/status`, token, {
    method: "POST",
    body: JSON.stringify({
      reason: "Proposta emitida no QA comercial",
      status: "PROPOSAL",
    }),
  });
  assert(proposedSale.data?.status === "PROPOSAL", `sale status expected PROPOSAL, got ${proposedSale.data?.status}`);
  checks.push(["saleStage", proposedSale.data.status]);

  const customerHistory = await authedJson(`/customers/${customer.id}/history`, token);
  assert(customerHistory.customer?.id === customer.id, "customer history did not return customer");
  assert(customerHistory.sales.some((item) => item.id === sale.data.id), "customer history does not include created sale");
  assert(customerHistory.events.length >= 1, "customer history does not include events");
  checks.push(["customerHistoryEvents", customerHistory.events.length]);

  await expectStatus("/finance/summary", token, 403);
  await expectStatus("/audit/logs?page=1&page_size=5", token, 403);
  checks.push(["sensitiveBlocks", "finance,audit"]);

  for (const route of ["/leads", "/clientes", "/agendamentos", "/vendas"]) {
    const response = await fetch(`${webBaseUrl}${route}`);
    assert(response.ok, `${route} returned ${response.status}`);
  }
  checks.push(["webCommercialRoutes", 4]);

  console.log("qa:commercial:local ok");
  for (const [label, value] of checks) {
    console.log(`- ${label}: ${value}`);
  }
}

main().catch((error) => {
  console.error("qa:commercial:local failed");
  console.error(error.message);
  process.exitCode = 1;
});
