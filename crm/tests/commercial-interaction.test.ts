import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMERCIAL_INTERACTION_CHANNELS,
  COMMERCIAL_INTERACTION_RESULTS,
  COMMERCIAL_INTERACTION_TYPES,
  COMMERCIAL_NEXT_ACTION_TYPES,
  commercialNotificationDedupKey,
  continuityNeedsManagerNotification,
  isCommercialInteractionChannel,
  isCommercialInteractionResult,
  isCommercialInteractionType,
  isCommercialNextActionType,
  isFollowUpOverdue,
  leadContinuityStatus,
} from "../apps/api/src/services/commercial-interaction.js";

const NOW = new Date("2026-06-18T12:00:00.000Z");
function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}
function hoursAhead(hours: number): Date {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000);
}

test("controlled lists are exposed and validated", () => {
  assert.equal(COMMERCIAL_INTERACTION_TYPES.length, 13);
  assert.equal(COMMERCIAL_INTERACTION_RESULTS.length, 12);
  assert.equal(COMMERCIAL_INTERACTION_CHANNELS.length, 6);
  assert.equal(COMMERCIAL_NEXT_ACTION_TYPES.length, 8);
  assert.equal(isCommercialInteractionType("CALL"), true);
  assert.equal(isCommercialInteractionType("PARTY"), false);
  assert.equal(isCommercialInteractionResult("PROPOSAL_SENT"), true);
  assert.equal(isCommercialNextActionType("CONFIRM_VISIT"), true);
});

test("WhatsApp manual is accepted as a channel (review-aligned)", () => {
  assert.equal(isCommercialInteractionChannel("WHATSAPP"), true);
  assert.equal(isCommercialInteractionChannel("PHONE"), true);
  assert.equal(isCommercialInteractionChannel("FACEBOOK"), false);
});

test("follow-up is overdue only when past and unresolved", () => {
  assert.equal(isFollowUpOverdue({ nextActionAt: hoursAgo(2), resolved: false, now: NOW }), true);
  // Resolved (completed/cancelled/rescheduled) -> not overdue.
  assert.equal(isFollowUpOverdue({ nextActionAt: hoursAgo(2), resolved: true, now: NOW }), false);
  // Future -> not overdue.
  assert.equal(isFollowUpOverdue({ nextActionAt: hoursAhead(2), resolved: false, now: NOW }), false);
  // No next action -> not overdue.
  assert.equal(isFollowUpOverdue({ nextActionAt: null, resolved: false, now: NOW }), false);
});

test("lead continuity escalates 24h/48h/72h and respects exceptions", () => {
  const base = { stageActive: true, hasFutureNextAction: false, hasFutureAppointment: false, now: NOW };
  assert.equal(leadContinuityStatus({ ...base, lastActivityAt: hoursAgo(1) }), "OK");
  assert.equal(leadContinuityStatus({ ...base, lastActivityAt: hoursAgo(24) }), "ATTENTION");
  assert.equal(leadContinuityStatus({ ...base, lastActivityAt: hoursAgo(48) }), "AT_RISK");
  assert.equal(leadContinuityStatus({ ...base, lastActivityAt: hoursAgo(72) }), "HIGH_RISK");

  // Exceptions -> always OK.
  assert.equal(leadContinuityStatus({ ...base, lastActivityAt: hoursAgo(96), stageActive: false }), "OK");
  assert.equal(leadContinuityStatus({ ...base, lastActivityAt: hoursAgo(96), hasFutureNextAction: true }), "OK");
  assert.equal(leadContinuityStatus({ ...base, lastActivityAt: hoursAgo(96), hasFutureAppointment: true }), "OK");
  assert.equal(leadContinuityStatus({ ...base, lastActivityAt: null }), "OK");
});

test("manager notification is required from 48h of no continuity", () => {
  assert.equal(continuityNeedsManagerNotification("OK"), false);
  assert.equal(continuityNeedsManagerNotification("ATTENTION"), false);
  assert.equal(continuityNeedsManagerNotification("AT_RISK"), true);
  assert.equal(continuityNeedsManagerNotification("HIGH_RISK"), true);
});

test("notification dedup key is stable per card + reason", () => {
  assert.equal(commercialNotificationDedupKey("card-1", "follow_up_overdue"), "follow_up_overdue:card-1");
  assert.equal(commercialNotificationDedupKey("card-1", "lead_no_continuity"), "lead_no_continuity:card-1");
  assert.notEqual(
    commercialNotificationDedupKey("card-1", "follow_up_overdue"),
    commercialNotificationDedupKey("card-2", "follow_up_overdue"),
  );
});
