import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMERCIAL_APPOINTMENT_ACTION_TARGET,
  COMMERCIAL_APPOINTMENT_STATUSES,
  COMMERCIAL_APPOINTMENT_TYPES,
  canCancelAppointment,
  canCompleteAppointment,
  canConfirmAppointment,
  canMarkAttended,
  canMarkNoResponse,
  canMarkNoShow,
  canRescheduleAppointment,
  commercialAppointmentLinkErrors,
  hasVehicleInterest,
  isCommercialAppointmentStatus,
  isCommercialAppointmentType,
  isTerminalAppointmentStatus,
  needsVisitConfirmation,
} from "../apps/api/src/services/commercial-appointment.js";

test("controlled type and status lists are exposed and validated", () => {
  assert.equal(COMMERCIAL_APPOINTMENT_TYPES.length, 10);
  assert.equal(COMMERCIAL_APPOINTMENT_STATUSES.length, 8);
  assert.equal(isCommercialAppointmentType("VISIT"), true);
  assert.equal(isCommercialAppointmentType("PARTY"), false);
  assert.equal(isCommercialAppointmentStatus("NO_SHOW"), true);
  assert.equal(isCommercialAppointmentStatus("WON"), false);
});

test("terminal statuses are cancelled, completed and rescheduled", () => {
  assert.equal(isTerminalAppointmentStatus("CANCELLED"), true);
  assert.equal(isTerminalAppointmentStatus("COMPLETED"), true);
  assert.equal(isTerminalAppointmentStatus("RESCHEDULED"), true);
  assert.equal(isTerminalAppointmentStatus("SCHEDULED"), false);
  assert.equal(isTerminalAppointmentStatus("CONFIRMED"), false);
});

test("status-transition gates allow the expected actions", () => {
  assert.equal(canConfirmAppointment("SCHEDULED"), true);
  assert.equal(canConfirmAppointment("CONFIRMED"), false);

  assert.equal(canMarkAttended("CONFIRMED"), true);
  assert.equal(canMarkAttended("SCHEDULED"), true);
  assert.equal(canMarkAttended("CANCELLED"), false);

  assert.equal(canCompleteAppointment("ATTENDED"), true);
  assert.equal(canCompleteAppointment("CANCELLED"), false);

  assert.equal(canMarkNoShow("CONFIRMED"), true);
  assert.equal(canMarkNoShow("COMPLETED"), false);

  assert.equal(canMarkNoResponse("SCHEDULED"), true);
  assert.equal(canMarkNoResponse("RESCHEDULED"), false);

  assert.equal(canRescheduleAppointment("NO_SHOW"), true);
  assert.equal(canRescheduleAppointment("CONFIRMED"), true);
  assert.equal(canRescheduleAppointment("COMPLETED"), false);

  assert.equal(canCancelAppointment("SCHEDULED"), true);
  assert.equal(canCancelAppointment("COMPLETED"), false);
});

test("cancellation is only allowed before an outcome is recorded (review fix #5)", () => {
  assert.equal(canCancelAppointment("SCHEDULED"), true);
  assert.equal(canCancelAppointment("CONFIRMED"), true);
  // Already-recorded outcomes are not cancellable.
  assert.equal(canCancelAppointment("ATTENDED"), false);
  assert.equal(canCancelAppointment("NO_SHOW"), false);
  assert.equal(canCancelAppointment("NO_RESPONSE"), false);
  // Terminal states remain non-cancellable.
  assert.equal(canCancelAppointment("COMPLETED"), false);
  assert.equal(canCancelAppointment("CANCELLED"), false);
  assert.equal(canCancelAppointment("RESCHEDULED"), false);
});

test("reschedule action targets the RESCHEDULED status", () => {
  assert.equal(COMMERCIAL_APPOINTMENT_ACTION_TARGET.reschedule, "RESCHEDULED");
  assert.equal(COMMERCIAL_APPOINTMENT_ACTION_TARGET.noShow, "NO_SHOW");
  assert.equal(COMMERCIAL_APPOINTMENT_ACTION_TARGET.confirm, "CONFIRMED");
});

test("mandatory link validation requires card + lead/customer + vehicle/interest", () => {
  assert.deepEqual(commercialAppointmentLinkErrors({}), ["card", "customer_or_lead", "vehicle_or_interest"]);
  assert.deepEqual(commercialAppointmentLinkErrors({ cardId: "c1", customerId: "cust1", vehicleId: "v1" }), []);
  assert.deepEqual(commercialAppointmentLinkErrors({ cardId: "c1", leadId: "l1", vehicleId: "v1" }), []);
  // Missing card is rejected.
  assert.deepEqual(commercialAppointmentLinkErrors({ customerId: "cust1", vehicleId: "v1" }), ["card"]);
  // Missing both customer and lead is rejected.
  assert.deepEqual(commercialAppointmentLinkErrors({ cardId: "c1", vehicleId: "v1" }), ["customer_or_lead"]);
});

test("0km/order interest satisfies the vehicle link without a physical vehicle", () => {
  assert.equal(hasVehicleInterest({ brand: "Toyota", model: "Corolla" }), true);
  assert.equal(hasVehicleInterest("Corolla Cross XRE 0km branco"), true);
  assert.equal(hasVehicleInterest({}), false);
  assert.equal(hasVehicleInterest(""), false);
  assert.equal(hasVehicleInterest(null), false);

  assert.deepEqual(
    commercialAppointmentLinkErrors({ cardId: "c1", leadId: "l1", vehicleInterest: { brand: "Toyota", model: "Corolla Cross" } }),
    [],
  );
  assert.deepEqual(commercialAppointmentLinkErrors({ cardId: "c1", leadId: "l1", vehicleInterest: {} }), ["vehicle_or_interest"]);
});

test("visit confirmation is needed within the 1h window for a still-scheduled visit", () => {
  const startsAt = new Date("2026-06-20T15:00:00.000Z");
  const within = new Date("2026-06-20T14:30:00.000Z"); // 30 min before
  const tooEarly = new Date("2026-06-20T13:30:00.000Z"); // 90 min before
  const afterStart = new Date("2026-06-20T15:05:00.000Z");

  assert.equal(needsVisitConfirmation({ type: "VISIT", status: "SCHEDULED", startsAt, now: within }), true);
  assert.equal(needsVisitConfirmation({ type: "TEST_DRIVE", status: "SCHEDULED", startsAt, now: within }), true);
  // Too early (outside the window).
  assert.equal(needsVisitConfirmation({ type: "VISIT", status: "SCHEDULED", startsAt, now: tooEarly }), false);
  // After the start time.
  assert.equal(needsVisitConfirmation({ type: "VISIT", status: "SCHEDULED", startsAt, now: afterStart }), false);
  // Already confirmed -> no confirmation task.
  assert.equal(needsVisitConfirmation({ type: "VISIT", status: "CONFIRMED", startsAt, now: within }), false);
  // Non-visit types never need a visit confirmation.
  assert.equal(needsVisitConfirmation({ type: "CALL", status: "SCHEDULED", startsAt, now: within }), false);
});
