// Pure (DB-free) domain rules for commercial interactions and follow-up (S2-US03).
// Controlled lists (types/results/channels/next-action), follow-up overdue detection,
// lead continuity status (24h/48h/72h) and the managerial-notification dedup key.

export type CommercialInteractionType =
  | "CALL"
  | "WHATSAPP_MANUAL"
  | "VISIT"
  | "TEST_DRIVE"
  | "PROPOSAL"
  | "NOTE"
  | "PROMISED_RETURN"
  | "OBJECTION"
  | "CONTACT_ATTEMPT"
  | "NO_RESPONSE"
  | "RESCHEDULE"
  | "RECOVERY"
  | "OTHER";

export const COMMERCIAL_INTERACTION_TYPES: readonly { key: CommercialInteractionType; label: string }[] = [
  { key: "CALL", label: "Ligacao" },
  { key: "WHATSAPP_MANUAL", label: "WhatsApp manual" },
  { key: "VISIT", label: "Visita" },
  { key: "TEST_DRIVE", label: "Test drive" },
  { key: "PROPOSAL", label: "Proposta" },
  { key: "NOTE", label: "Observacao" },
  { key: "PROMISED_RETURN", label: "Retorno prometido" },
  { key: "OBJECTION", label: "Objecao do cliente" },
  { key: "CONTACT_ATTEMPT", label: "Tentativa de contato" },
  { key: "NO_RESPONSE", label: "Sem resposta" },
  { key: "RESCHEDULE", label: "Reagendamento" },
  { key: "RECOVERY", label: "Resgate" },
  { key: "OTHER", label: "Outro" },
] as const;

export type CommercialInteractionResult =
  | "CONTACT_MADE"
  | "NO_RESPONSE"
  | "CUSTOMER_REQUESTED_RETURN"
  | "VISIT_SCHEDULED"
  | "VISIT_CONFIRMED"
  | "VISIT_MISSED"
  | "TEST_DRIVE_SCHEDULED"
  | "PROPOSAL_SENT"
  | "NEGOTIATION_IN_PROGRESS"
  | "CUSTOMER_NOT_INTERESTED"
  | "NEEDS_RECOVERY"
  | "OTHER";

export const COMMERCIAL_INTERACTION_RESULTS: readonly { key: CommercialInteractionResult; label: string }[] = [
  { key: "CONTACT_MADE", label: "Contato realizado" },
  { key: "NO_RESPONSE", label: "Sem resposta" },
  { key: "CUSTOMER_REQUESTED_RETURN", label: "Cliente pediu retorno" },
  { key: "VISIT_SCHEDULED", label: "Visita agendada" },
  { key: "VISIT_CONFIRMED", label: "Visita confirmada" },
  { key: "VISIT_MISSED", label: "Visita perdida" },
  { key: "TEST_DRIVE_SCHEDULED", label: "Test drive agendado" },
  { key: "PROPOSAL_SENT", label: "Proposta enviada" },
  { key: "NEGOTIATION_IN_PROGRESS", label: "Negociacao em andamento" },
  { key: "CUSTOMER_NOT_INTERESTED", label: "Cliente sem interesse" },
  { key: "NEEDS_RECOVERY", label: "Precisa resgate" },
  { key: "OTHER", label: "Outro" },
] as const;

export type CommercialInteractionChannel = "PHONE" | "WHATSAPP" | "IN_PERSON" | "EMAIL" | "SMS" | "OTHER";

export const COMMERCIAL_INTERACTION_CHANNELS: readonly { key: CommercialInteractionChannel; label: string }[] = [
  { key: "PHONE", label: "Telefone" },
  { key: "WHATSAPP", label: "WhatsApp (manual)" },
  { key: "IN_PERSON", label: "Presencial" },
  { key: "EMAIL", label: "E-mail" },
  { key: "SMS", label: "SMS" },
  { key: "OTHER", label: "Outro" },
] as const;

export type CommercialNextActionType =
  | "CALL"
  | "WHATSAPP_MANUAL"
  | "CONFIRM_VISIT"
  | "RESCHEDULE"
  | "RECOVER"
  | "SEND_PROPOSAL"
  | "AWAIT_RETURN"
  | "OTHER";

export const COMMERCIAL_NEXT_ACTION_TYPES: readonly { key: CommercialNextActionType; label: string }[] = [
  { key: "CALL", label: "Ligar" },
  { key: "WHATSAPP_MANUAL", label: "Enviar WhatsApp manual" },
  { key: "CONFIRM_VISIT", label: "Confirmar visita" },
  { key: "RESCHEDULE", label: "Reagendar" },
  { key: "RECOVER", label: "Resgatar atendimento" },
  { key: "SEND_PROPOSAL", label: "Enviar proposta" },
  { key: "AWAIT_RETURN", label: "Aguardar retorno" },
  { key: "OTHER", label: "Outro" },
] as const;

function keySet<T extends { key: string }>(entries: readonly T[]): ReadonlySet<string> {
  return new Set(entries.map((entry) => entry.key));
}

const INTERACTION_TYPE_KEYS = keySet(COMMERCIAL_INTERACTION_TYPES);
const INTERACTION_RESULT_KEYS = keySet(COMMERCIAL_INTERACTION_RESULTS);
const INTERACTION_CHANNEL_KEYS = keySet(COMMERCIAL_INTERACTION_CHANNELS);
const NEXT_ACTION_TYPE_KEYS = keySet(COMMERCIAL_NEXT_ACTION_TYPES);

export function isCommercialInteractionType(value: unknown): value is CommercialInteractionType {
  return typeof value === "string" && INTERACTION_TYPE_KEYS.has(value);
}
export function isCommercialInteractionResult(value: unknown): value is CommercialInteractionResult {
  return typeof value === "string" && INTERACTION_RESULT_KEYS.has(value);
}
export function isCommercialInteractionChannel(value: unknown): value is CommercialInteractionChannel {
  return typeof value === "string" && INTERACTION_CHANNEL_KEYS.has(value);
}
export function isCommercialNextActionType(value: unknown): value is CommercialNextActionType {
  return typeof value === "string" && NEXT_ACTION_TYPE_KEYS.has(value);
}

// ---------------------------------------------------------------------------
// Follow-up overdue (Regras de Follow-up Vencido)
// ---------------------------------------------------------------------------

// A follow-up is overdue when its next_action_at has passed and the next action has NOT
// been resolved (completed/cancelled/rescheduled).
export function isFollowUpOverdue(input: { nextActionAt: Date | null; resolved: boolean; now: Date }): boolean {
  if (!input.nextActionAt || input.resolved) {
    return false;
  }
  return input.now.getTime() > input.nextActionAt.getTime();
}

// ---------------------------------------------------------------------------
// Lead continuity (Lead Sem Aviso de Continuidade): 24h / 48h / 72h
// ---------------------------------------------------------------------------

export type ContinuityStatus = "OK" | "ATTENTION" | "AT_RISK" | "HIGH_RISK";

export const CONTINUITY_THRESHOLDS_HOURS = {
  ATTENTION: 24,
  AT_RISK: 48,
  HIGH_RISK: 72,
} as const;

const HOUR_MS = 60 * 60 * 1000;

export function leadContinuityStatus(input: {
  // Card is on an active stage (not lost / not a closed flow).
  stageActive: boolean;
  hasFutureNextAction: boolean;
  hasFutureAppointment: boolean;
  // Most recent activity (interaction/next action); caller falls back to createdAt.
  lastActivityAt: Date | null;
  now: Date;
}): ContinuityStatus {
  // No continuity alert for closed/lost cards or when there is a planned next step.
  if (!input.stageActive || input.hasFutureNextAction || input.hasFutureAppointment) {
    return "OK";
  }
  if (!input.lastActivityAt) {
    return "OK";
  }
  const hours = Math.floor(Math.max(0, input.now.getTime() - input.lastActivityAt.getTime()) / HOUR_MS);
  if (hours >= CONTINUITY_THRESHOLDS_HOURS.HIGH_RISK) {
    return "HIGH_RISK";
  }
  if (hours >= CONTINUITY_THRESHOLDS_HOURS.AT_RISK) {
    return "AT_RISK";
  }
  if (hours >= CONTINUITY_THRESHOLDS_HOURS.ATTENTION) {
    return "ATTENTION";
  }
  return "OK";
}

// From 48h on, the lack of continuity must notify Administrador/Dono-Gestor (24h is card-only).
export function continuityNeedsManagerNotification(status: ContinuityStatus): boolean {
  return status === "AT_RISK" || status === "HIGH_RISK";
}

// ---------------------------------------------------------------------------
// Managerial notification dedup (avoid duplicate alerts per card + reason)
// ---------------------------------------------------------------------------

export type CommercialNotificationType = "follow_up_overdue" | "lead_no_continuity";

export const COMMERCIAL_NOTIFICATION_TYPES: readonly CommercialNotificationType[] = [
  "follow_up_overdue",
  "lead_no_continuity",
] as const;

export function commercialNotificationDedupKey(cardId: string, notificationType: CommercialNotificationType): string {
  return `${notificationType}:${cardId}`;
}
