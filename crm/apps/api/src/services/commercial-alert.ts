// Pure (DB-free) domain rules for commercial alerts and priority queue (S2-US05).
// This consolidates the signals created in S2-US01/S2-US03/S2-US04 into a stable
// alert taxonomy, SLA thresholds, dedup keys and ordering rules.

import {
  needsVisitConfirmation,
  type CommercialAppointmentStatus,
  type CommercialAppointmentType,
} from "./commercial-appointment.js";
import { isActiveStage, type CommercialStageKey } from "./commercial-kanban.js";
import { isFollowUpOverdue, leadContinuityStatus, type ContinuityStatus } from "./commercial-interaction.js";

export type CommercialAlertType =
  | "follow_up_overdue"
  | "visit_confirmation_due"
  | "appointment_upcoming"
  | "no_show_recovery"
  | "lead_high_risk"
  | "lead_cooling"
  | "negotiation_stalled"
  | "purchase_confirmation_stalled"
  | "missing_next_action"
  | "lead_attention";

export type CommercialAlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CommercialAlertStatus = "PENDING" | "VIEWED" | "RESOLVED" | "DISMISSED" | "EXPIRED";
export type CommercialAlertAudience = "RESPONSIBLE" | "MANAGEMENT";

export const COMMERCIAL_ALERT_STATUSES: readonly CommercialAlertStatus[] = [
  "PENDING",
  "VIEWED",
  "RESOLVED",
  "DISMISSED",
  "EXPIRED",
] as const;

export const COMMERCIAL_ALERT_SLA = {
  leadAttentionHours: 24,
  leadCoolingHours: 48,
  leadHighRiskHours: 72,
  appointmentUpcomingHours: 2,
  visitConfirmationMinutes: 60,
  negotiationStalledHours: 48,
} as const;

export type CommercialAlertRule = {
  type: CommercialAlertType;
  label: string;
  severity: CommercialAlertSeverity;
  priority: number;
  suggestedAction: string;
  audiences: readonly CommercialAlertAudience[];
};

export const COMMERCIAL_ALERT_RULES: readonly CommercialAlertRule[] = [
  {
    type: "follow_up_overdue",
    label: "Follow-up vencido",
    severity: "CRITICAL",
    priority: 10,
    suggestedAction: "Retomar o contato ou reagendar o follow-up.",
    audiences: ["RESPONSIBLE", "MANAGEMENT"],
  },
  {
    type: "visit_confirmation_due",
    label: "Visita precisa confirmacao",
    severity: "HIGH",
    priority: 20,
    suggestedAction: "Confirmar a visita antes do horario agendado.",
    audiences: ["RESPONSIBLE"],
  },
  {
    type: "appointment_upcoming",
    label: "Agendamento proximo",
    severity: "HIGH",
    priority: 30,
    suggestedAction: "Preparar atendimento e contato com o cliente.",
    audiences: ["RESPONSIBLE"],
  },
  {
    type: "no_show_recovery",
    label: "Nao comparecimento pendente de resgate",
    severity: "HIGH",
    priority: 35,
    suggestedAction: "Registrar tentativa de resgate e propor reagendamento.",
    audiences: ["RESPONSIBLE", "MANAGEMENT"],
  },
  {
    type: "lead_high_risk",
    label: "Lead em risco alto",
    severity: "HIGH",
    priority: 40,
    suggestedAction: "Executar acao de resgate imediatamente.",
    audiences: ["RESPONSIBLE", "MANAGEMENT"],
  },
  {
    type: "lead_cooling",
    label: "Lead esfriando",
    severity: "MEDIUM",
    priority: 50,
    suggestedAction: "Criar proxima acao e retomar contato.",
    audiences: ["RESPONSIBLE", "MANAGEMENT"],
  },
  {
    type: "negotiation_stalled",
    label: "Negociacao parada",
    severity: "HIGH",
    priority: 60,
    suggestedAction: "Atualizar a negociacao ou definir proxima acao.",
    audiences: ["RESPONSIBLE", "MANAGEMENT"],
  },
  {
    type: "purchase_confirmation_stalled",
    label: "Confirmacao de compra parada",
    severity: "HIGH",
    priority: 65,
    suggestedAction: "Confirmar compra, registrar pendencia ou encerrar o card.",
    audiences: ["RESPONSIBLE", "MANAGEMENT"],
  },
  {
    type: "missing_next_action",
    label: "Card sem proxima acao",
    severity: "MEDIUM",
    priority: 70,
    suggestedAction: "Definir o proximo passo operacional.",
    audiences: ["RESPONSIBLE"],
  },
  {
    type: "lead_attention",
    label: "Lead sem acao recente",
    severity: "LOW",
    priority: 80,
    suggestedAction: "Registrar interacao ou planejar follow-up.",
    audiences: ["RESPONSIBLE"],
  },
] as const;

const ALERT_RULE_BY_TYPE = new Map(COMMERCIAL_ALERT_RULES.map((rule) => [rule.type, rule]));
const ALERT_TYPE_KEYS: ReadonlySet<string> = new Set(COMMERCIAL_ALERT_RULES.map((rule) => rule.type));
const ALERT_STATUS_KEYS: ReadonlySet<string> = new Set(COMMERCIAL_ALERT_STATUSES);
const NEXT_ACTION_REQUIRED_STAGES: ReadonlySet<CommercialStageKey> = new Set([
  "IN_CONTACT",
  "VISITED",
  "TEST_DRIVE",
  "NEGOTIATION",
  "AWAITING_RETURN",
  "AWAITING_PURCHASE_CONFIRMATION",
]);

const HOUR_MS = 60 * 60 * 1000;

export type CommercialAlertCandidate = {
  type: CommercialAlertType;
  cardId: string;
  leadId?: string | null;
  appointmentId?: string | null;
  severity: CommercialAlertSeverity;
  priority: number;
  title: string;
  reason: string;
  suggestedAction: string;
  audiences: readonly CommercialAlertAudience[];
  dueAt: Date | null;
  triggeredAt: Date;
  metadata?: Record<string, unknown>;
};

export function isCommercialAlertType(value: unknown): value is CommercialAlertType {
  return typeof value === "string" && ALERT_TYPE_KEYS.has(value);
}

export function isCommercialAlertStatus(value: unknown): value is CommercialAlertStatus {
  return typeof value === "string" && ALERT_STATUS_KEYS.has(value);
}

export function commercialAlertRule(type: CommercialAlertType): CommercialAlertRule {
  const rule = ALERT_RULE_BY_TYPE.get(type);
  if (!rule) {
    throw new Error(`Unknown commercial alert type: ${type}`);
  }
  return rule;
}

export function commercialAlertDedupKey(cardId: string, alertType: CommercialAlertType): string {
  return `${alertType}:${cardId}`;
}

export function commercialAlertNeedsManagement(type: CommercialAlertType): boolean {
  return commercialAlertRule(type).audiences.includes("MANAGEMENT");
}

function candidate(input: {
  type: CommercialAlertType;
  cardId: string;
  leadId?: string | null;
  appointmentId?: string | null;
  reason: string;
  dueAt?: Date | null;
  triggeredAt: Date;
  metadata?: Record<string, unknown>;
}): CommercialAlertCandidate {
  const rule = commercialAlertRule(input.type);
  return {
    type: input.type,
    cardId: input.cardId,
    leadId: input.leadId,
    appointmentId: input.appointmentId,
    severity: rule.severity,
    priority: rule.priority,
    title: rule.label,
    reason: input.reason,
    suggestedAction: rule.suggestedAction,
    audiences: rule.audiences,
    dueAt: input.dueAt ?? null,
    triggeredAt: input.triggeredAt,
    metadata: input.metadata,
  };
}

function hoursSince(date: Date, now: Date): number {
  return Math.floor(Math.max(0, now.getTime() - date.getTime()) / HOUR_MS);
}

function hoursUntil(date: Date, now: Date): number {
  return (date.getTime() - now.getTime()) / HOUR_MS;
}

function continuityAlertType(status: ContinuityStatus): CommercialAlertType | null {
  switch (status) {
    case "ATTENTION":
      return "lead_attention";
    case "AT_RISK":
      return "lead_cooling";
    case "HIGH_RISK":
      return "lead_high_risk";
    case "OK":
    default:
      return null;
  }
}

export function detectLeadContinuityAlert(input: {
  cardId: string;
  leadId?: string | null;
  stage: CommercialStageKey;
  lastActivityAt: Date | null;
  hasFutureNextAction: boolean;
  hasFutureAppointment: boolean;
  now: Date;
}): CommercialAlertCandidate | null {
  const status = leadContinuityStatus({
    stageActive: isActiveStage(input.stage),
    hasFutureNextAction: input.hasFutureNextAction,
    hasFutureAppointment: input.hasFutureAppointment,
    lastActivityAt: input.lastActivityAt,
    now: input.now,
  });
  const type = continuityAlertType(status);
  if (!type || !input.lastActivityAt) {
    return null;
  }

  return candidate({
    type,
    cardId: input.cardId,
    leadId: input.leadId,
    reason: `Card sem continuidade ha ${hoursSince(input.lastActivityAt, input.now)}h.`,
    dueAt: input.lastActivityAt,
    triggeredAt: input.now,
    metadata: { continuityStatus: status, stage: input.stage },
  });
}

export function detectFollowUpOverdueAlert(input: {
  cardId: string;
  leadId?: string | null;
  nextActionAt: Date | null;
  resolved: boolean;
  now: Date;
}): CommercialAlertCandidate | null {
  if (!isFollowUpOverdue({ nextActionAt: input.nextActionAt, resolved: input.resolved, now: input.now }) || !input.nextActionAt) {
    return null;
  }

  return candidate({
    type: "follow_up_overdue",
    cardId: input.cardId,
    leadId: input.leadId,
    reason: "Proxima acao pendente esta vencida.",
    dueAt: input.nextActionAt,
    triggeredAt: input.now,
  });
}

export function detectAppointmentAlert(input: {
  cardId: string;
  leadId?: string | null;
  appointmentId?: string | null;
  type: CommercialAppointmentType;
  status: CommercialAppointmentStatus;
  startsAt: Date;
  now: Date;
}): CommercialAlertCandidate | null {
  if (input.status === "NO_SHOW") {
    return candidate({
      type: "no_show_recovery",
      cardId: input.cardId,
      leadId: input.leadId,
      appointmentId: input.appointmentId,
      reason: "Cliente nao compareceu e precisa tentativa de resgate.",
      dueAt: input.startsAt,
      triggeredAt: input.now,
    });
  }

  if (needsVisitConfirmation({ type: input.type, status: input.status, startsAt: input.startsAt, now: input.now })) {
    return candidate({
      type: "visit_confirmation_due",
      cardId: input.cardId,
      leadId: input.leadId,
      appointmentId: input.appointmentId,
      reason: "Visita ainda nao confirmada dentro da janela de 1h.",
      dueAt: input.startsAt,
      triggeredAt: input.now,
    });
  }

  const withinUpcomingWindow =
    ["SCHEDULED", "CONFIRMED"].includes(input.status) &&
    input.startsAt.getTime() >= input.now.getTime() &&
    hoursUntil(input.startsAt, input.now) <= COMMERCIAL_ALERT_SLA.appointmentUpcomingHours;

  if (!withinUpcomingWindow) {
    return null;
  }

  return candidate({
    type: "appointment_upcoming",
    cardId: input.cardId,
    leadId: input.leadId,
    appointmentId: input.appointmentId,
    reason: "Agendamento comercial nas proximas 2h.",
    dueAt: input.startsAt,
    triggeredAt: input.now,
    metadata: { appointmentType: input.type, appointmentStatus: input.status },
  });
}

export function detectNegotiationStalledAlert(input: {
  cardId: string;
  leadId?: string | null;
  stage: CommercialStageKey;
  stageEnteredAt: Date;
  hasFutureNextAction: boolean;
  now: Date;
}): CommercialAlertCandidate | null {
  if (input.hasFutureNextAction) {
    return null;
  }
  const stalled = hoursSince(input.stageEnteredAt, input.now) >= COMMERCIAL_ALERT_SLA.negotiationStalledHours;
  if (!stalled) {
    return null;
  }

  if (input.stage === "NEGOTIATION") {
    return candidate({
      type: "negotiation_stalled",
      cardId: input.cardId,
      leadId: input.leadId,
      reason: "Negociacao sem atualizacao ha pelo menos 48h.",
      dueAt: input.stageEnteredAt,
      triggeredAt: input.now,
      metadata: { stage: input.stage },
    });
  }

  if (input.stage === "AWAITING_PURCHASE_CONFIRMATION") {
    return candidate({
      type: "purchase_confirmation_stalled",
      cardId: input.cardId,
      leadId: input.leadId,
      reason: "Confirmacao de compra parada ha pelo menos 48h.",
      dueAt: input.stageEnteredAt,
      triggeredAt: input.now,
      metadata: { stage: input.stage },
    });
  }

  return null;
}

export function detectMissingNextActionAlert(input: {
  cardId: string;
  leadId?: string | null;
  stage: CommercialStageKey;
  hasFutureNextAction: boolean;
  hasFutureAppointment: boolean;
  now: Date;
}): CommercialAlertCandidate | null {
  if (
    !isActiveStage(input.stage) ||
    !NEXT_ACTION_REQUIRED_STAGES.has(input.stage) ||
    input.hasFutureNextAction ||
    input.hasFutureAppointment
  ) {
    return null;
  }

  return candidate({
    type: "missing_next_action",
    cardId: input.cardId,
    leadId: input.leadId,
    reason: "Card esta em etapa que exige continuidade, mas nao possui proxima acao.",
    triggeredAt: input.now,
    metadata: { stage: input.stage },
  });
}

export function sortCommercialAlertCandidates<T extends CommercialAlertCandidate>(alerts: readonly T[]): T[] {
  return [...alerts].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const dueA = a.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const dueB = b.dueAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;
    return a.triggeredAt.getTime() - b.triggeredAt.getTime();
  });
}
