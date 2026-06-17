// Pure (DB-free) domain rules for the commercial SDR/Vendas Kanban (S2-US01).
// Centralizes the controlled stage list, role-based movement rules, time-in-stage
// and the simple cooling/temperature rule (24h/48h/72h) so routes and tests share
// a single source of truth. No Prisma / IO here.

export type CommercialStageKey =
  | "NEW_LEAD"
  | "IN_CONTACT"
  | "SCHEDULED"
  | "VISITED"
  | "TEST_DRIVE"
  | "NEGOTIATION"
  | "AWAITING_RETURN"
  | "AWAITING_PURCHASE_CONFIRMATION"
  | "LOST";

export type CommercialStage = {
  key: CommercialStageKey;
  order: number;
  label: string;
};

// Board identifier used in LeadCard.boardKey to separate this board from the
// legacy "leads" board created in S1-US05.
export const COMMERCIAL_BOARD_KEY = "commercial";

export const COMMERCIAL_STAGES: readonly CommercialStage[] = [
  { key: "NEW_LEAD", order: 1, label: "Novo lead" },
  { key: "IN_CONTACT", order: 2, label: "Em contato" },
  { key: "SCHEDULED", order: 3, label: "Agendado" },
  { key: "VISITED", order: 4, label: "Visitou loja" },
  { key: "TEST_DRIVE", order: 5, label: "Test drive realizado" },
  { key: "NEGOTIATION", order: 6, label: "Em negociacao" },
  { key: "AWAITING_RETURN", order: 7, label: "Aguardando retorno" },
  { key: "AWAITING_PURCHASE_CONFIRMATION", order: 8, label: "Aguardando confirmacao de compra" },
  { key: "LOST", order: 9, label: "Perdido/sem interesse" },
] as const;

const COMMERCIAL_STAGE_KEYS: ReadonlySet<string> = new Set(COMMERCIAL_STAGES.map((stage) => stage.key));

// LOST is the only terminal stage in this story: it leaves the default active view
// (archived) but stays consultable. AWAITING_PURCHASE_CONFIRMATION stays visible and
// ready for the purchase hand-off (S2-US04).
export const COMMERCIAL_TERMINAL_STAGES: ReadonlySet<CommercialStageKey> = new Set(["LOST"]);

export function isCommercialStage(value: unknown): value is CommercialStageKey {
  return typeof value === "string" && COMMERCIAL_STAGE_KEYS.has(value);
}

export function commercialStageLabel(key: CommercialStageKey): string {
  return COMMERCIAL_STAGES.find((stage) => stage.key === key)?.label ?? key;
}

// A stage is part of the default active view unless it is terminal (LOST).
export function isActiveStage(stage: CommercialStageKey): boolean {
  return !COMMERCIAL_TERMINAL_STAGES.has(stage);
}

// ---------------------------------------------------------------------------
// Role-based movement rules (Decisoes Confirmadas + Regras de Movimentacao)
// ---------------------------------------------------------------------------

// SDR moves the early stages and may forward to NEGOTIATION when there is a direct
// negotiation with a seller. SDR must NOT reach the purchase-confirmation / lost stages.
const SDR_ALLOWED_TARGET_STAGES: ReadonlySet<CommercialStageKey> = new Set([
  "NEW_LEAD",
  "IN_CONTACT",
  "SCHEDULED",
  "VISITED",
  "NEGOTIATION",
]);

// Roles that drive the full commercial flow (all stages, including LOST).
const FULL_FLOW_ROLES: ReadonlySet<string> = new Set(["OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE", "SELLER"]);

export function allowedTargetStagesForRole(role: string): CommercialStageKey[] {
  if (FULL_FLOW_ROLES.has(role)) {
    return COMMERCIAL_STAGES.map((stage) => stage.key);
  }
  if (role === "SDR") {
    return COMMERCIAL_STAGES.map((stage) => stage.key).filter((key) => SDR_ALLOWED_TARGET_STAGES.has(key));
  }
  return [];
}

export function canRoleMoveToStage(role: string, toStage: string): boolean {
  if (!isCommercialStage(toStage)) {
    return false;
  }
  if (FULL_FLOW_ROLES.has(role)) {
    return true;
  }
  if (role === "SDR") {
    return SDR_ALLOWED_TARGET_STAGES.has(toStage);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Time parked in the current stage
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;

export function timeInStageMs(stageEnteredAt: Date, now: Date): number {
  return Math.max(0, now.getTime() - stageEnteredAt.getTime());
}

export function timeInStageHours(stageEnteredAt: Date, now: Date): number {
  return Math.floor(timeInStageMs(stageEnteredAt, now) / HOUR_MS);
}

// ---------------------------------------------------------------------------
// Cooling / temperature rule (Lead Esfriando / Prioridade Simples)
// ---------------------------------------------------------------------------

export type TemperatureStatus = "NONE" | "ATTENTION" | "COOLING" | "HIGH_RISK";

export const TEMPERATURE_THRESHOLDS_HOURS = {
  ATTENTION: 24,
  COOLING: 48,
  HIGH_RISK: 72,
} as const;

const TEMPERATURE_ORDER: TemperatureStatus[] = ["NONE", "ATTENTION", "COOLING", "HIGH_RISK"];

function reduceTemperature(status: TemperatureStatus): TemperatureStatus {
  const index = TEMPERATURE_ORDER.indexOf(status);
  return TEMPERATURE_ORDER[Math.max(0, index - 1)];
}

export type TemperatureInput = {
  stage: CommercialStageKey;
  // Effective last interaction timestamp (caller falls back to createdAt when null).
  lastInteractionAt: Date | null;
  now: Date;
  // A confirmed future appointment softens the alert by one level (but the card
  // should still surface its next action).
  hasFutureSchedule?: boolean;
};

export function computeTemperatureStatus(input: TemperatureInput): TemperatureStatus {
  // A lost/archived card does not generate an active alert.
  if (COMMERCIAL_TERMINAL_STAGES.has(input.stage)) {
    return "NONE";
  }

  if (!input.lastInteractionAt) {
    return "NONE";
  }

  const hours = Math.floor(Math.max(0, input.now.getTime() - input.lastInteractionAt.getTime()) / HOUR_MS);

  let status: TemperatureStatus = "NONE";
  if (hours >= TEMPERATURE_THRESHOLDS_HOURS.HIGH_RISK) {
    status = "HIGH_RISK";
  } else if (hours >= TEMPERATURE_THRESHOLDS_HOURS.COOLING) {
    status = "COOLING";
  } else if (hours >= TEMPERATURE_THRESHOLDS_HOURS.ATTENTION) {
    status = "ATTENTION";
  }

  if (input.hasFutureSchedule && status !== "NONE") {
    status = reduceTemperature(status);
  }

  return status;
}
