// Pure (DB-free) status rules for the technical delivery lifecycle (S2-US06).
// Centralizes which transitions are allowed so the routes and unit tests share a
// single source of truth. No Prisma / IO here.

export type TechnicalDeliveryStatus =
  | "AWAITING_PREREQUISITES"
  | "READY_TO_SCHEDULE"
  | "SCHEDULED"
  | "DOCUMENT_GENERATED"
  | "PRINTED_PENDING_SIGNATURE"
  | "COMPLETED_SIGNED"
  | "PENDING_SIGNED_COPY"
  | "RESCHEDULED"
  | "CANCELLED"
  | "BLOCKED";

export const TECHNICAL_DELIVERY_STATUSES: readonly TechnicalDeliveryStatus[] = [
  "AWAITING_PREREQUISITES",
  "READY_TO_SCHEDULE",
  "SCHEDULED",
  "DOCUMENT_GENERATED",
  "PRINTED_PENDING_SIGNATURE",
  "COMPLETED_SIGNED",
  "PENDING_SIGNED_COPY",
  "RESCHEDULED",
  "CANCELLED",
  "BLOCKED",
] as const;

const STATUS_SET: ReadonlySet<string> = new Set(TECHNICAL_DELIVERY_STATUSES);

export function isTechnicalDeliveryStatus(value: unknown): value is TechnicalDeliveryStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

// Terminal states: nothing further happens automatically from here.
export const TECHNICAL_DELIVERY_TERMINAL_STATUSES: ReadonlySet<TechnicalDeliveryStatus> = new Set([
  "COMPLETED_SIGNED",
  "CANCELLED",
]);

export function isTerminalStatus(status: TechnicalDeliveryStatus): boolean {
  return TECHNICAL_DELIVERY_TERMINAL_STATUSES.has(status);
}

// A document can be (re)generated while the delivery is effectively scheduled or
// already generated/printed (regeneration produces a new version).
export const DOCUMENT_GENERATABLE_STATUSES: ReadonlySet<TechnicalDeliveryStatus> = new Set([
  "SCHEDULED",
  "RESCHEDULED",
  "DOCUMENT_GENERATED",
  "PRINTED_PENDING_SIGNATURE",
]);

// Printing requires a generated document (re-printing while pending signature is allowed).
export const PRINTABLE_STATUSES: ReadonlySet<TechnicalDeliveryStatus> = new Set([
  "DOCUMENT_GENERATED",
  "PRINTED_PENDING_SIGNATURE",
]);

// The signed copy can be registered once the document has been printed for signature,
// or when the delivery is explicitly awaiting the signed copy attachment.
export const SIGNED_COPY_REGISTRABLE_STATUSES: ReadonlySet<TechnicalDeliveryStatus> = new Set([
  "PRINTED_PENDING_SIGNATURE",
  "PENDING_SIGNED_COPY",
]);

export function canGenerateDocument(status: TechnicalDeliveryStatus): boolean {
  return DOCUMENT_GENERATABLE_STATUSES.has(status);
}

export function canMarkPrinted(status: TechnicalDeliveryStatus): boolean {
  return PRINTABLE_STATUSES.has(status);
}

export function canRegisterSignedCopy(status: TechnicalDeliveryStatus): boolean {
  return SIGNED_COPY_REGISTRABLE_STATUSES.has(status);
}

// Any non-terminal delivery can be cancelled.
export function canCancel(status: TechnicalDeliveryStatus): boolean {
  return !isTerminalStatus(status);
}

// Target status produced by each action (used by the routes to advance the lifecycle).
export const TECHNICAL_DELIVERY_ACTION_TARGET = {
  generateDocument: "DOCUMENT_GENERATED",
  print: "PRINTED_PENDING_SIGNATURE",
  registerSignedCopy: "COMPLETED_SIGNED",
  cancel: "CANCELLED",
} as const satisfies Record<string, TechnicalDeliveryStatus>;
