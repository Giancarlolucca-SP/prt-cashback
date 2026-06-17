import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTechnicalDeliveryDocument,
  renderTechnicalDeliveryDocumentHtml,
  technicalDeliveryDocumentNumber,
  type TechnicalDeliveryDocumentInput,
} from "../apps/api/src/services/technical-delivery-document.js";

const checklist = [
  { key: "turn_signals", label: "Piscas/setas" },
  { key: "external_lights", label: "Luzes externas" },
  { key: "spare_key", label: "Chave reserva" },
];

function baseInput(overrides: Partial<TechnicalDeliveryDocumentInput> = {}): TechnicalDeliveryDocumentInput {
  return {
    documentId: "11112222-3333-4444-5555-666677778888",
    generatedAt: new Date("2026-06-17T13:30:00.000Z"),
    store: { name: "GT3 Motors", legalName: "GT3 Comercio de Veiculos LTDA", cnpj: "12.345.678/0001-90" },
    customer: { name: "Maria Compradora", document: "123.456.789-00", phone: "(11) 90000-0000", email: "maria@example.com" },
    vehicle: {
      brand: "Volkswagen",
      model: "Golf",
      version: "GTI",
      yearModel: 2022,
      yearBuild: 2021,
      plate: "ABC1D23",
      vin: "9BWZZZ377VT004251",
      color: "Preto",
    },
    seller: { name: "Joao Vendedor" },
    responsible: { name: "Ana Administrativa" },
    scheduledBy: { name: "Ana Administrativa" },
    sale: { id: "aaaa1111-2222-3333-4444-555566667777", status: "DOCUMENT_GENERATED" },
    scheduledAt: new Date("2026-06-20T17:00:00.000Z"),
    status: "DOCUMENT_GENERATED",
    checklist,
    ...overrides,
  };
}

test("document number is stable and derived from the document id", () => {
  assert.equal(technicalDeliveryDocumentNumber("11112222-3333-4444-5555-666677778888"), "ET-1111222233");
});

test("buildTechnicalDeliveryDocument auto-fills the data known by the system", () => {
  const doc = buildTechnicalDeliveryDocument(baseInput());

  assert.equal(doc.documentNumber, "ET-1111222233");
  assert.equal(doc.generatedAt, "2026-06-17T13:30:00.000Z");
  assert.equal(doc.store.name, "GT3 Motors");
  assert.equal(doc.customer.name, "Maria Compradora");
  assert.equal(doc.vehicle.plate, "ABC1D23");
  assert.equal(doc.seller?.name, "Joao Vendedor");
  assert.equal(doc.scheduledBy?.name, "Ana Administrativa");
  assert.equal(doc.scheduledAt, "2026-06-20T17:00:00.000Z");
  assert.equal(doc.checklist.length, checklist.length);
  assert.deepEqual(doc.checklist[0], { key: "turn_signals", label: "Piscas/setas" });
});

test("missing optional relations become explicit nulls (no crash)", () => {
  const doc = buildTechnicalDeliveryDocument(
    baseInput({ seller: null, responsible: null, scheduledBy: null, vehicle: { brand: "Fiat", model: "Argo" } }),
  );

  assert.equal(doc.seller, null);
  assert.equal(doc.responsible, null);
  assert.equal(doc.vehicle.plate, null);
  assert.equal(doc.vehicle.version, null);
});

test("rendered HTML is a self-contained printable document with filled data", () => {
  const doc = buildTechnicalDeliveryDocument(baseInput());
  const html = renderTechnicalDeliveryDocumentHtml(doc);

  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<style>/);
  assert.match(html, /@media print/);
  assert.match(html, /Maria Compradora/);
  assert.match(html, /ABC1D23/);
  assert.match(html, /Joao Vendedor/);
  assert.match(html, /ET-1111222233/);
  // scheduled date formatted dd/mm/yyyy
  assert.match(html, /20\/06\/2026/);
});

test("rendered HTML includes every checklist item with manual marking and signature fields", () => {
  const doc = buildTechnicalDeliveryDocument(baseInput());
  const html = renderTechnicalDeliveryDocumentHtml(doc);

  for (const item of checklist) {
    assert.ok(html.includes(item.label), `checklist item missing: ${item.label}`);
  }
  assert.match(html, /OK/);
  assert.match(html, /N\/A/);
  assert.match(html, /Observacao/);
  assert.match(html, /Assinatura do cliente/);
  assert.match(html, /Responsavel da loja/);
});

test("rendered HTML escapes data to avoid breaking the markup", () => {
  const doc = buildTechnicalDeliveryDocument(
    baseInput({ customer: { name: "<script>alert(1)</script>", document: null, phone: null, email: null } }),
  );
  const html = renderTechnicalDeliveryDocumentHtml(doc);

  assert.ok(!html.includes("<script>alert(1)</script>"));
  assert.match(html, /&lt;script&gt;/);
});
