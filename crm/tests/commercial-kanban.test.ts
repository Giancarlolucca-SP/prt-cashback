import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMERCIAL_STAGES,
  COMMERCIAL_BOARD_KEY,
  allowedTargetStagesForRole,
  canRoleMoveToStage,
  commercialStageLabel,
  computeTemperatureStatus,
  isActiveStage,
  isCommercialStage,
  timeInStageHours,
  timeInStageMs,
  type CommercialStageKey,
} from "../apps/api/src/services/commercial-kanban.js";

const NOW = new Date("2026-06-17T12:00:00.000Z");

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

test("commercial board exposes the nine confirmed columns in order", () => {
  assert.equal(COMMERCIAL_BOARD_KEY, "commercial");
  assert.equal(COMMERCIAL_STAGES.length, 9);
  assert.deepEqual(
    COMMERCIAL_STAGES.map((stage) => stage.key),
    [
      "NEW_LEAD",
      "IN_CONTACT",
      "SCHEDULED",
      "VISITED",
      "TEST_DRIVE",
      "NEGOTIATION",
      "AWAITING_RETURN",
      "AWAITING_PURCHASE_CONFIRMATION",
      "LOST",
    ],
  );
  assert.deepEqual(
    COMMERCIAL_STAGES.map((stage) => stage.order),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.equal(commercialStageLabel("AWAITING_PURCHASE_CONFIRMATION"), "Aguardando confirmacao de compra");
});

test("stage validation rejects unknown stages", () => {
  assert.equal(isCommercialStage("NEW_LEAD"), true);
  assert.equal(isCommercialStage("WON"), false);
  assert.equal(isCommercialStage("not-a-stage"), false);
  assert.equal(isCommercialStage(undefined), false);
});

test("only LOST leaves the default active view", () => {
  assert.equal(isActiveStage("LOST"), false);
  assert.equal(isActiveStage("AWAITING_PURCHASE_CONFIRMATION"), true);
  assert.equal(isActiveStage("NEW_LEAD"), true);
});

test("SDR moves early stages and may forward to negotiation, but never confirms purchase", () => {
  for (const stage of ["NEW_LEAD", "IN_CONTACT", "SCHEDULED", "VISITED", "NEGOTIATION"] as CommercialStageKey[]) {
    assert.equal(canRoleMoveToStage("SDR", stage), true, `SDR should move to ${stage}`);
  }
  assert.equal(canRoleMoveToStage("SDR", "AWAITING_PURCHASE_CONFIRMATION"), false);
  assert.equal(canRoleMoveToStage("SDR", "AWAITING_RETURN"), false);
  assert.equal(canRoleMoveToStage("SDR", "LOST"), false);
  assert.deepEqual(allowedTargetStagesForRole("SDR"), ["NEW_LEAD", "IN_CONTACT", "SCHEDULED", "VISITED", "NEGOTIATION"]);
});

test("seller and managers can move the full commercial flow", () => {
  for (const role of ["SELLER", "OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE"]) {
    for (const stage of COMMERCIAL_STAGES) {
      assert.equal(canRoleMoveToStage(role, stage.key), true, `${role} -> ${stage.key}`);
    }
    assert.equal(allowedTargetStagesForRole(role).length, 9);
  }
});

test("roles without commercial movement cannot move and get no target stages", () => {
  assert.equal(canRoleMoveToStage("APPRAISER", "NEW_LEAD"), false);
  assert.equal(canRoleMoveToStage("SERVICE_MANAGER", "IN_CONTACT"), false);
  assert.deepEqual(allowedTargetStagesForRole("APPRAISER"), []);
});

test("invalid target stage is rejected regardless of role", () => {
  assert.equal(canRoleMoveToStage("OWNER_MANAGER", "WON"), false);
  assert.equal(canRoleMoveToStage("SELLER", "garbage"), false);
});

test("time parked in stage is computed from stage entry", () => {
  assert.equal(timeInStageHours(hoursAgo(30), NOW), 30);
  assert.equal(timeInStageMs(hoursAgo(2), NOW), 2 * 60 * 60 * 1000);
  // Never negative when the entry timestamp is in the future (clock skew).
  assert.equal(timeInStageHours(new Date(NOW.getTime() + 5_000), NOW), 0);
});

test("cooling rule escalates at 24h / 48h / 72h", () => {
  assert.equal(computeTemperatureStatus({ stage: "IN_CONTACT", lastInteractionAt: hoursAgo(1), now: NOW }), "NONE");
  assert.equal(computeTemperatureStatus({ stage: "IN_CONTACT", lastInteractionAt: hoursAgo(24), now: NOW }), "ATTENTION");
  assert.equal(computeTemperatureStatus({ stage: "IN_CONTACT", lastInteractionAt: hoursAgo(48), now: NOW }), "COOLING");
  assert.equal(computeTemperatureStatus({ stage: "IN_CONTACT", lastInteractionAt: hoursAgo(72), now: NOW }), "HIGH_RISK");
});

test("lost cards never generate an active alert", () => {
  assert.equal(computeTemperatureStatus({ stage: "LOST", lastInteractionAt: hoursAgo(200), now: NOW }), "NONE");
});

test("a confirmed future appointment softens the alert by one level", () => {
  assert.equal(
    computeTemperatureStatus({ stage: "SCHEDULED", lastInteractionAt: hoursAgo(72), now: NOW, hasFutureSchedule: true }),
    "COOLING",
  );
  assert.equal(
    computeTemperatureStatus({ stage: "SCHEDULED", lastInteractionAt: hoursAgo(24), now: NOW, hasFutureSchedule: true }),
    "NONE",
  );
  // Without a last interaction there is no alert to soften.
  assert.equal(computeTemperatureStatus({ stage: "SCHEDULED", lastInteractionAt: null, now: NOW }), "NONE");
});
