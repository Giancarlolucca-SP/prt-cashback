import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOSING_RELEASES_DOCUMENTS,
  CUSTOMER_ARRIVAL_STATUSES,
  FINANCING_TYPES,
  INITIAL_DOC_STATUSES,
  SALES_NEGOTIATION_STATUSES,
  SALES_PAYMENT_STATUSES,
  canCloseDeal,
  canTransferToSales,
  closingRequirementErrors,
  isFinancingType,
  isSalesNegotiationStatus,
  isSalesPaymentStatus,
  isSalesTerminalStatus,
  requiresOwnFinancingAlert,
} from "../apps/api/src/services/sales-transition.js";

test("controlled lists are exposed and validated", () => {
  assert.equal(SALES_NEGOTIATION_STATUSES.length, 5);
  assert.equal(CUSTOMER_ARRIVAL_STATUSES.length, 4);
  assert.equal(FINANCING_TYPES.length, 3);
  assert.equal(SALES_PAYMENT_STATUSES.length, 5);
  assert.equal(INITIAL_DOC_STATUSES.length, 3);
  assert.equal(isSalesNegotiationStatus("CLOSED_WON"), true);
  assert.equal(isSalesNegotiationStatus("WON"), false);
  assert.equal(isFinancingType("CUSTOMER_OWN"), true);
  assert.equal(isSalesPaymentStatus("PENDING_REVIEW"), true);
});

test("CLOSED_WON and LOST are terminal", () => {
  assert.equal(isSalesTerminalStatus("CLOSED_WON"), true);
  assert.equal(isSalesTerminalStatus("LOST"), true);
  assert.equal(isSalesTerminalStatus("IN_NEGOTIATION"), false);
});

test("SDR transfers to sales but never closes a deal (AC15)", () => {
  assert.equal(canTransferToSales("SDR"), true);
  assert.equal(canTransferToSales("OWNER_MANAGER"), true);
  assert.equal(canTransferToSales("ADMIN"), true);
  // Sellers receive/assume, they do not initiate the SDR->Sales transfer.
  assert.equal(canTransferToSales("SELLER"), false);

  assert.equal(canCloseDeal("SDR"), false);
  assert.equal(canCloseDeal("SELLER"), true);
  assert.equal(canCloseDeal("OWNER_MANAGER"), true);
  assert.equal(canCloseDeal("ADMIN"), true);
  assert.equal(canCloseDeal("ADMINISTRATIVE"), true);
});

test("closing requires a positive negotiated value and a payment method", () => {
  assert.deepEqual(closingRequirementErrors({}), ["negotiated_value", "payment_method"]);
  assert.deepEqual(closingRequirementErrors({ negotiatedValue: 0, paymentMethod: "PIX" }), ["negotiated_value"]);
  assert.deepEqual(closingRequirementErrors({ negotiatedValue: 95000, paymentMethod: "" }), ["payment_method"]);
  assert.deepEqual(closingRequirementErrors({ negotiatedValue: 95000, paymentMethod: "financiamento" }), []);
});

test("own financing requires an alert; other financing does not", () => {
  assert.equal(requiresOwnFinancingAlert("CUSTOMER_OWN"), true);
  assert.equal(requiresOwnFinancingAlert("STORE_PARTNER"), false);
  assert.equal(requiresOwnFinancingAlert("NOT_APPLICABLE"), false);
  assert.equal(requiresOwnFinancingAlert(null), false);
});

test("closing a deal never releases documents/delivery", () => {
  assert.equal(CLOSING_RELEASES_DOCUMENTS, false);
});
