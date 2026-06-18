import assert from "node:assert/strict";
import test from "node:test";
import {
  TECHNICAL_DELIVERY_ACTION_TARGET,
  TECHNICAL_DELIVERY_STATUSES,
  canCancel,
  canGenerateDocument,
  canMarkPrinted,
  canRegisterSignedCopy,
  isTechnicalDeliveryStatus,
  isTerminalStatus,
} from "../apps/api/src/services/technical-delivery-status.js";
import {
  TECHNICAL_DELIVERY_SIGNED_COPY_PURPOSE,
  technicalDeliveryLinkTargets,
} from "../apps/api/src/services/technical-delivery-attachments.js";

test("status validation accepts the known lifecycle and rejects anything else", () => {
  assert.equal(TECHNICAL_DELIVERY_STATUSES.length, 10);
  assert.equal(isTechnicalDeliveryStatus("DOCUMENT_GENERATED"), true);
  assert.equal(isTechnicalDeliveryStatus("PRINTED_PENDING_SIGNATURE"), true);
  assert.equal(isTechnicalDeliveryStatus("WON"), false);
  assert.equal(isTechnicalDeliveryStatus(undefined), false);
});

test("COMPLETED_SIGNED and CANCELLED are terminal", () => {
  assert.equal(isTerminalStatus("COMPLETED_SIGNED"), true);
  assert.equal(isTerminalStatus("CANCELLED"), true);
  assert.equal(isTerminalStatus("SCHEDULED"), false);
});

test("document generation is gated to effectively-scheduled states", () => {
  assert.equal(canGenerateDocument("SCHEDULED"), true);
  assert.equal(canGenerateDocument("RESCHEDULED"), true);
  assert.equal(canGenerateDocument("DOCUMENT_GENERATED"), true);
  assert.equal(canGenerateDocument("PRINTED_PENDING_SIGNATURE"), true);
  assert.equal(canGenerateDocument("AWAITING_PREREQUISITES"), false);
  assert.equal(canGenerateDocument("CANCELLED"), false);
});

test("printing requires a generated document", () => {
  assert.equal(canMarkPrinted("DOCUMENT_GENERATED"), true);
  assert.equal(canMarkPrinted("PRINTED_PENDING_SIGNATURE"), true);
  assert.equal(canMarkPrinted("SCHEDULED"), false);
  assert.equal(canMarkPrinted("COMPLETED_SIGNED"), false);
});

test("signed copy can only be registered after printing for signature", () => {
  assert.equal(canRegisterSignedCopy("PRINTED_PENDING_SIGNATURE"), true);
  assert.equal(canRegisterSignedCopy("PENDING_SIGNED_COPY"), true);
  assert.equal(canRegisterSignedCopy("DOCUMENT_GENERATED"), false);
  assert.equal(canRegisterSignedCopy("SCHEDULED"), false);
  assert.equal(canRegisterSignedCopy("COMPLETED_SIGNED"), false);
});

test("only non-terminal deliveries can be cancelled", () => {
  assert.equal(canCancel("SCHEDULED"), true);
  assert.equal(canCancel("PRINTED_PENDING_SIGNATURE"), true);
  assert.equal(canCancel("COMPLETED_SIGNED"), false);
  assert.equal(canCancel("CANCELLED"), false);
});

test("the happy-path lifecycle gates advance step by step", () => {
  // SCHEDULED -> generate -> print -> signed copy -> COMPLETED_SIGNED
  assert.equal(canGenerateDocument("SCHEDULED"), true);
  assert.equal(TECHNICAL_DELIVERY_ACTION_TARGET.generateDocument, "DOCUMENT_GENERATED");

  assert.equal(canMarkPrinted("DOCUMENT_GENERATED"), true);
  assert.equal(TECHNICAL_DELIVERY_ACTION_TARGET.print, "PRINTED_PENDING_SIGNATURE");

  assert.equal(canRegisterSignedCopy("PRINTED_PENDING_SIGNATURE"), true);
  assert.equal(TECHNICAL_DELIVERY_ACTION_TARGET.registerSignedCopy, "COMPLETED_SIGNED");

  assert.equal(isTerminalStatus("COMPLETED_SIGNED"), true);
});

test("signed copy is linked to the vehicle digital folder, the sale and the customer", () => {
  const targets = technicalDeliveryLinkTargets({ vehicleId: "veh-1", saleId: "sale-1", customerId: "cust-1" });

  assert.deepEqual(targets, [
    { entityType: "vehicle", entityId: "veh-1" },
    { entityType: "sale", entityId: "sale-1" },
    { entityType: "customer", entityId: "cust-1" },
  ]);
  // The vehicle link is what places the signed copy in the vehicle digital folder.
  assert.ok(targets.some((target) => target.entityType === "vehicle"));
  assert.equal(TECHNICAL_DELIVERY_SIGNED_COPY_PURPOSE, "technical_delivery_signed_copy");
});
