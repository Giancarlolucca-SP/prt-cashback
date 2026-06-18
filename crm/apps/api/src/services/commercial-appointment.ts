// Pure (DB-free) domain rules for commercial appointments (S2-US02).
// Controlled type/status lists, mandatory-link validation, status-transition gates and
// the visit confirmation window. Routes and unit tests share this single source of truth.

export type CommercialAppointmentType =
  | "VISIT"
  | "TEST_DRIVE"
  | "FOLLOW_UP"
  | "CALL"
  | "IN_PERSON"
  | "VISIT_CONFIRMATION"
  | "RESCHEDULE"
  | "NO_SHOW_RECOVERY"
  | "INITIAL_TECHNICAL_DELIVERY"
  | "COMMERCIAL_RECONTACT";

export const COMMERCIAL_APPOINTMENT_TYPES: readonly { key: CommercialAppointmentType; label: string }[] = [
  { key: "VISIT", label: "Visita na loja" },
  { key: "TEST_DRIVE", label: "Test drive" },
  { key: "FOLLOW_UP", label: "Retorno/follow-up" },
  { key: "CALL", label: "Ligacao" },
  { key: "IN_PERSON", label: "Atendimento presencial" },
  { key: "VISIT_CONFIRMATION", label: "Confirmacao de visita" },
  { key: "RESCHEDULE", label: "Reagendamento" },
  { key: "NO_SHOW_RECOVERY", label: "Resgate de nao comparecimento" },
  { key: "INITIAL_TECHNICAL_DELIVERY", label: "Entrega tecnica inicial" },
  { key: "COMMERCIAL_RECONTACT", label: "Recontato comercial" },
] as const;

export type CommercialAppointmentStatus =
  | "SCHEDULED"
  | "CONFIRMED"
  | "RESCHEDULED"
  | "ATTENDED"
  | "NO_SHOW"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_RESPONSE";

export const COMMERCIAL_APPOINTMENT_STATUSES: readonly { key: CommercialAppointmentStatus; label: string }[] = [
  { key: "SCHEDULED", label: "Agendado" },
  { key: "CONFIRMED", label: "Confirmado" },
  { key: "RESCHEDULED", label: "Reagendado" },
  { key: "ATTENDED", label: "Compareceu" },
  { key: "NO_SHOW", label: "Nao compareceu" },
  { key: "CANCELLED", label: "Cancelado" },
  { key: "COMPLETED", label: "Concluido" },
  { key: "NO_RESPONSE", label: "Sem resposta" },
] as const;

const TYPE_KEYS: ReadonlySet<string> = new Set(COMMERCIAL_APPOINTMENT_TYPES.map((type) => type.key));
const STATUS_KEYS: ReadonlySet<string> = new Set(COMMERCIAL_APPOINTMENT_STATUSES.map((status) => status.key));

export function isCommercialAppointmentType(value: unknown): value is CommercialAppointmentType {
  return typeof value === "string" && TYPE_KEYS.has(value);
}

export function isCommercialAppointmentStatus(value: unknown): value is CommercialAppointmentStatus {
  return typeof value === "string" && STATUS_KEYS.has(value);
}

export function commercialAppointmentTypeLabel(type: CommercialAppointmentType): string {
  return COMMERCIAL_APPOINTMENT_TYPES.find((entry) => entry.key === type)?.label ?? type;
}

export function commercialAppointmentStatusLabel(status: CommercialAppointmentStatus): string {
  return COMMERCIAL_APPOINTMENT_STATUSES.find((entry) => entry.key === status)?.label ?? status;
}

// Terminal: nothing else happens from here (RESCHEDULED means a successor appointment took over).
export const TERMINAL_APPOINTMENT_STATUSES: ReadonlySet<CommercialAppointmentStatus> = new Set([
  "CANCELLED",
  "COMPLETED",
  "RESCHEDULED",
]);

export function isTerminalAppointmentStatus(status: CommercialAppointmentStatus): boolean {
  return TERMINAL_APPOINTMENT_STATUSES.has(status);
}

// ---------------------------------------------------------------------------
// Status-transition gates (action-centric)
// ---------------------------------------------------------------------------

const CONFIRMABLE: ReadonlySet<CommercialAppointmentStatus> = new Set(["SCHEDULED"]);
const ATTENDABLE: ReadonlySet<CommercialAppointmentStatus> = new Set(["SCHEDULED", "CONFIRMED"]);
const COMPLETABLE: ReadonlySet<CommercialAppointmentStatus> = new Set(["SCHEDULED", "CONFIRMED", "ATTENDED"]);
const NO_SHOWABLE: ReadonlySet<CommercialAppointmentStatus> = new Set(["SCHEDULED", "CONFIRMED"]);
const NO_RESPONSEABLE: ReadonlySet<CommercialAppointmentStatus> = new Set(["SCHEDULED", "CONFIRMED"]);
const RESCHEDULABLE: ReadonlySet<CommercialAppointmentStatus> = new Set(["SCHEDULED", "CONFIRMED", "NO_SHOW", "NO_RESPONSE"]);
// Cancellation only makes sense before an outcome is recorded; ATTENDED/NO_SHOW/NO_RESPONSE
// (and the terminal states) already carry an outcome and are not cancellable.
const CANCELLABLE: ReadonlySet<CommercialAppointmentStatus> = new Set(["SCHEDULED", "CONFIRMED"]);

export function canConfirmAppointment(status: CommercialAppointmentStatus): boolean {
  return CONFIRMABLE.has(status);
}
export function canMarkAttended(status: CommercialAppointmentStatus): boolean {
  return ATTENDABLE.has(status);
}
export function canCompleteAppointment(status: CommercialAppointmentStatus): boolean {
  return COMPLETABLE.has(status);
}
export function canMarkNoShow(status: CommercialAppointmentStatus): boolean {
  return NO_SHOWABLE.has(status);
}
export function canMarkNoResponse(status: CommercialAppointmentStatus): boolean {
  return NO_RESPONSEABLE.has(status);
}
export function canRescheduleAppointment(status: CommercialAppointmentStatus): boolean {
  return RESCHEDULABLE.has(status);
}
export function canCancelAppointment(status: CommercialAppointmentStatus): boolean {
  return CANCELLABLE.has(status);
}

export const COMMERCIAL_APPOINTMENT_ACTION_TARGET = {
  confirm: "CONFIRMED",
  reschedule: "RESCHEDULED",
  attended: "ATTENDED",
  complete: "COMPLETED",
  noShow: "NO_SHOW",
  noResponse: "NO_RESPONSE",
  cancel: "CANCELLED",
} as const satisfies Record<string, CommercialAppointmentStatus>;

// ---------------------------------------------------------------------------
// Mandatory link validation (Vinculo Obrigatorio)
// ---------------------------------------------------------------------------

export type CommercialAppointmentLinkInput = {
  cardId?: string | null;
  customerId?: string | null;
  leadId?: string | null;
  vehicleId?: string | null;
  // 0km / order spec: a string or an object describing the desired vehicle.
  vehicleInterest?: unknown;
};

export function hasVehicleInterest(value: unknown): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(
      (entry) => entry !== null && entry !== undefined && String(entry).trim() !== "",
    );
  }
  return false;
}

// Returns the list of missing mandatory links (empty = valid).
export function commercialAppointmentLinkErrors(input: CommercialAppointmentLinkInput): string[] {
  const errors: string[] = [];
  if (!input.cardId) {
    errors.push("card");
  }
  if (!input.customerId && !input.leadId) {
    errors.push("customer_or_lead");
  }
  if (!input.vehicleId && !hasVehicleInterest(input.vehicleInterest)) {
    errors.push("vehicle_or_interest");
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Visit confirmation window (FR-022CC / FR-022CJ: confirm at least 1h before)
// ---------------------------------------------------------------------------

const VISIT_LIKE_TYPES: ReadonlySet<CommercialAppointmentType> = new Set(["VISIT", "TEST_DRIVE", "IN_PERSON"]);
export const CONFIRMATION_WINDOW_MINUTES = 60;

export function needsVisitConfirmation(input: {
  type: CommercialAppointmentType;
  status: CommercialAppointmentStatus;
  startsAt: Date;
  now: Date;
  windowMinutes?: number;
}): boolean {
  if (!VISIT_LIKE_TYPES.has(input.type)) {
    return false;
  }
  // Only a still-scheduled (not yet confirmed) visit needs a confirmation task.
  if (input.status !== "SCHEDULED") {
    return false;
  }
  const windowMinutes = input.windowMinutes ?? CONFIRMATION_WINDOW_MINUTES;
  const windowStart = input.startsAt.getTime() - windowMinutes * 60 * 1000;
  return input.now.getTime() >= windowStart && input.now.getTime() < input.startsAt.getTime();
}

// ---------------------------------------------------------------------------
// Lead → commercial appointment bridge helpers
// ---------------------------------------------------------------------------

// The Lead model has no structured 0km/order interest; it only has a free-text `interest`.
// Decision: when the lead has no physical vehicle, derive the appointment's vehicleInterest
// from that free text so 0km/order leads are not discarded by the mandatory-link rule.
export function deriveLeadVehicleLink(lead: { vehicleId?: string | null; interest?: string | null }): {
  vehicleId: string | null;
  vehicleInterest: { note: string } | null;
} {
  if (lead.vehicleId) {
    return { vehicleId: lead.vehicleId, vehicleInterest: null };
  }
  const interest = lead.interest?.trim();
  if (interest) {
    return { vehicleId: null, vehicleInterest: { note: interest } };
  }
  return { vehicleId: null, vehicleInterest: null };
}

// Derive a commercial appointment type from a free-text follow-up type (default FOLLOW_UP).
export function mapFollowUpTypeToAppointmentType(followUpType: string | null | undefined): CommercialAppointmentType {
  const value = (followUpType ?? "").toLowerCase();
  if (value.includes("test") && value.includes("drive")) {
    return "TEST_DRIVE";
  }
  // Check confirmation before plain "visit" since "confirmar visita" contains both.
  if (value.includes("confirm")) {
    return "VISIT_CONFIRMATION";
  }
  if (value.includes("visit")) {
    return "VISIT";
  }
  if (value.includes("recontat")) {
    return "COMMERCIAL_RECONTACT";
  }
  if (value.includes("ligac") || value.includes("call")) {
    return "CALL";
  }
  return "FOLLOW_UP";
}
