import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMERCIAL_ALERT_RULES,
  COMMERCIAL_ALERT_SLA,
  commercialAlertDedupKey,
  commercialAlertNeedsManagement,
  detectAppointmentAlert,
  detectFollowUpOverdueAlert,
  detectLeadContinuityAlert,
  detectMissingNextActionAlert,
  detectNegotiationStalledAlert,
  isCommercialAlertStatus,
  isCommercialAlertType,
  sortCommercialAlertCandidates,
} from "../apps/api/src/services/commercial-alert.js";

const NOW = new Date("2026-06-18T12:00:00.000Z");

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

function minutesAhead(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60 * 1000);
}

test("controlled alert taxonomy exposes priority and validation", () => {
  assert.equal(COMMERCIAL_ALERT_RULES.length, 10);
  assert.equal(COMMERCIAL_ALERT_SLA.leadAttentionHours, 24);
  assert.equal(COMMERCIAL_ALERT_SLA.appointmentUpcomingHours, 2);
  assert.equal(COMMERCIAL_ALERT_RULES[0].type, "follow_up_overdue");
  assert.equal(isCommercialAlertType("lead_high_risk"), true);
  assert.equal(isCommercialAlertType("unknown_alert"), false);
  assert.equal(isCommercialAlertStatus("PENDING"), true);
  assert.equal(isCommercialAlertStatus("OPEN"), false);
});

test("lead continuity generates 24h, 48h and 72h alert levels", () => {
  const base = {
    cardId: "card-1",
    leadId: "lead-1",
    stage: "IN_CONTACT" as const,
    hasFutureNextAction: false,
    hasFutureAppointment: false,
    now: NOW,
  };

  assert.equal(detectLeadContinuityAlert({ ...base, lastActivityAt: hoursAgo(23) }), null);

  const attention = detectLeadContinuityAlert({ ...base, lastActivityAt: hoursAgo(24) });
  assert.equal(attention?.type, "lead_attention");
  assert.equal(attention?.severity, "LOW");

  const cooling = detectLeadContinuityAlert({ ...base, lastActivityAt: hoursAgo(48) });
  assert.equal(cooling?.type, "lead_cooling");
  assert.equal(cooling?.severity, "MEDIUM");
  assert.equal(commercialAlertNeedsManagement(cooling!.type), true);

  const highRisk = detectLeadContinuityAlert({ ...base, lastActivityAt: hoursAgo(72) });
  assert.equal(highRisk?.type, "lead_high_risk");
  assert.equal(highRisk?.severity, "HIGH");
});

test("follow-up overdue generates a critical alert only while unresolved", () => {
  const overdue = detectFollowUpOverdueAlert({
    cardId: "card-1",
    leadId: "lead-1",
    nextActionAt: hoursAgo(2),
    resolved: false,
    now: NOW,
  });
  assert.equal(overdue?.type, "follow_up_overdue");
  assert.equal(overdue?.severity, "CRITICAL");
  assert.equal(overdue?.dueAt?.toISOString(), hoursAgo(2).toISOString());

  assert.equal(
    detectFollowUpOverdueAlert({ cardId: "card-1", nextActionAt: hoursAgo(2), resolved: true, now: NOW }),
    null,
  );
});

test("appointment alerts cover upcoming, visit confirmation and no-show recovery", () => {
  const confirmedVisit = detectAppointmentAlert({
    cardId: "card-1",
    appointmentId: "appt-1",
    type: "VISIT",
    status: "CONFIRMED",
    startsAt: minutesAhead(90),
    now: NOW,
  });
  assert.equal(confirmedVisit?.type, "appointment_upcoming");

  const unconfirmedVisit = detectAppointmentAlert({
    cardId: "card-1",
    appointmentId: "appt-2",
    type: "VISIT",
    status: "SCHEDULED",
    startsAt: minutesAhead(45),
    now: NOW,
  });
  assert.equal(unconfirmedVisit?.type, "visit_confirmation_due");
  assert.equal(unconfirmedVisit?.priority, 20);

  const noShow = detectAppointmentAlert({
    cardId: "card-1",
    appointmentId: "appt-3",
    type: "VISIT",
    status: "NO_SHOW",
    startsAt: hoursAgo(1),
    now: NOW,
  });
  assert.equal(noShow?.type, "no_show_recovery");
  assert.equal(commercialAlertNeedsManagement(noShow!.type), true);
});

test("negotiation stalled and missing-next-action alerts respect exceptions", () => {
  const stalled = detectNegotiationStalledAlert({
    cardId: "card-1",
    leadId: "lead-1",
    stage: "NEGOTIATION",
    stageEnteredAt: hoursAgo(48),
    hasFutureNextAction: false,
    now: NOW,
  });
  assert.equal(stalled?.type, "negotiation_stalled");
  assert.equal(stalled?.severity, "HIGH");

  const withAction = detectNegotiationStalledAlert({
    cardId: "card-1",
    stage: "NEGOTIATION",
    stageEnteredAt: hoursAgo(80),
    hasFutureNextAction: true,
    now: NOW,
  });
  assert.equal(withAction, null);

  const missingAction = detectMissingNextActionAlert({
    cardId: "card-1",
    stage: "AWAITING_RETURN",
    hasFutureNextAction: false,
    hasFutureAppointment: false,
    now: NOW,
  });
  assert.equal(missingAction?.type, "missing_next_action");

  const newLead = detectMissingNextActionAlert({
    cardId: "card-2",
    stage: "NEW_LEAD",
    hasFutureNextAction: false,
    hasFutureAppointment: false,
    now: NOW,
  });
  assert.equal(newLead, null);
});

test("dedup key and priority ordering are stable", () => {
  assert.equal(commercialAlertDedupKey("card-1", "lead_cooling"), "lead_cooling:card-1");

  const alerts = [
    detectLeadContinuityAlert({
      cardId: "card-1",
      stage: "IN_CONTACT",
      lastActivityAt: hoursAgo(72),
      hasFutureNextAction: false,
      hasFutureAppointment: false,
      now: NOW,
    })!,
    detectFollowUpOverdueAlert({
      cardId: "card-2",
      nextActionAt: hoursAgo(1),
      resolved: false,
      now: NOW,
    })!,
    detectMissingNextActionAlert({
      cardId: "card-3",
      stage: "AWAITING_RETURN",
      hasFutureNextAction: false,
      hasFutureAppointment: false,
      now: NOW,
    })!,
  ];

  assert.deepEqual(sortCommercialAlertCandidates(alerts).map((alert) => alert.type), [
    "follow_up_overdue",
    "lead_high_risk",
    "missing_next_action",
  ]);
});
