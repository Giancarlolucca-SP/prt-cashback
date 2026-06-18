// Pure (DB-free) domain rules for the SDR -> Sales -> Management/Documentation transition (S2-US04).
// Controlled lists, role rules (who may transfer / close), closing-requirement validation, the
// own-financing alert, and the invariant that closing a deal never releases documents/delivery.

export type SalesNegotiationStatus = "ASSUMED" | "IN_NEGOTIATION" | "AWAITING_RETURN" | "LOST" | "CLOSED_WON";

export const SALES_NEGOTIATION_STATUSES: readonly { key: SalesNegotiationStatus; label: string }[] = [
  { key: "ASSUMED", label: "Vendedor assumiu" },
  { key: "IN_NEGOTIATION", label: "Em negociacao" },
  { key: "AWAITING_RETURN", label: "Aguardando retorno" },
  { key: "LOST", label: "Perdido/sem interesse" },
  { key: "CLOSED_WON", label: "Negocio fechado" },
] as const;

export type CustomerArrivalStatus = "VISIT_SCHEDULED" | "AT_STORE" | "DIRECT_NEGOTIATION" | "OTHER";

export const CUSTOMER_ARRIVAL_STATUSES: readonly { key: CustomerArrivalStatus; label: string }[] = [
  { key: "VISIT_SCHEDULED", label: "Visita agendada" },
  { key: "AT_STORE", label: "Cliente na loja" },
  { key: "DIRECT_NEGOTIATION", label: "Negociacao direta" },
  { key: "OTHER", label: "Outro" },
] as const;

export type FinancingType = "STORE_PARTNER" | "CUSTOMER_OWN" | "NOT_APPLICABLE";

export const FINANCING_TYPES: readonly { key: FinancingType; label: string }[] = [
  { key: "STORE_PARTNER", label: "Loja/parceira" },
  { key: "CUSTOMER_OWN", label: "Financeira propria do cliente" },
  { key: "NOT_APPLICABLE", label: "Nao aplicavel" },
] as const;

export type SalesPaymentStatus = "PENDING_REVIEW" | "AWAITING_PROOF" | "RECEIVED_MANUAL" | "DIVERGENT" | "NOT_APPLICABLE";

export const SALES_PAYMENT_STATUSES: readonly { key: SalesPaymentStatus; label: string }[] = [
  { key: "PENDING_REVIEW", label: "Pendente de conferencia" },
  { key: "AWAITING_PROOF", label: "Aguardando comprovante" },
  { key: "RECEIVED_MANUAL", label: "Recebido/conferido manualmente" },
  { key: "DIVERGENT", label: "Divergente" },
  { key: "NOT_APPLICABLE", label: "Nao aplicavel" },
] as const;

export type InitialDocStatus = "PENDING" | "PARTIAL" | "COLLECTED";

export const INITIAL_DOC_STATUSES: readonly { key: InitialDocStatus; label: string }[] = [
  { key: "PENDING", label: "Pendente" },
  { key: "PARTIAL", label: "Parcial" },
  { key: "COLLECTED", label: "Recolhida" },
] as const;

function keySet<T extends { key: string }>(entries: readonly T[]): ReadonlySet<string> {
  return new Set(entries.map((entry) => entry.key));
}

const NEGOTIATION_STATUS_KEYS = keySet(SALES_NEGOTIATION_STATUSES);
const ARRIVAL_STATUS_KEYS = keySet(CUSTOMER_ARRIVAL_STATUSES);
const FINANCING_TYPE_KEYS = keySet(FINANCING_TYPES);
const PAYMENT_STATUS_KEYS = keySet(SALES_PAYMENT_STATUSES);
const INITIAL_DOC_STATUS_KEYS = keySet(INITIAL_DOC_STATUSES);

export function isSalesNegotiationStatus(value: unknown): value is SalesNegotiationStatus {
  return typeof value === "string" && NEGOTIATION_STATUS_KEYS.has(value);
}
export function isCustomerArrivalStatus(value: unknown): value is CustomerArrivalStatus {
  return typeof value === "string" && ARRIVAL_STATUS_KEYS.has(value);
}
export function isFinancingType(value: unknown): value is FinancingType {
  return typeof value === "string" && FINANCING_TYPE_KEYS.has(value);
}
export function isSalesPaymentStatus(value: unknown): value is SalesPaymentStatus {
  return typeof value === "string" && PAYMENT_STATUS_KEYS.has(value);
}
export function isInitialDocStatus(value: unknown): value is InitialDocStatus {
  return typeof value === "string" && INITIAL_DOC_STATUS_KEYS.has(value);
}

// CLOSED_WON / LOST are terminal for the sales flow.
export const SALES_TERMINAL_STATUSES: ReadonlySet<SalesNegotiationStatus> = new Set(["CLOSED_WON", "LOST"]);
export function isSalesTerminalStatus(status: SalesNegotiationStatus): boolean {
  return SALES_TERMINAL_STATUSES.has(status);
}

// ---------------------------------------------------------------------------
// Role rules
// ---------------------------------------------------------------------------

// SDR initiates the SDR -> Sales transfer (to a seller); managers/admin too. Sellers RECEIVE.
const TRANSFER_ROLES: ReadonlySet<string> = new Set(["SDR", "OWNER_MANAGER", "ADMIN"]);
export function canTransferToSales(role: string): boolean {
  return TRANSFER_ROLES.has(role);
}

// The seller (and management/admin/administrative) marks a deal closed. SDR NEVER closes.
const CLOSE_ROLES: ReadonlySet<string> = new Set(["SELLER", "OWNER_MANAGER", "ADMIN", "ADMINISTRATIVE"]);
export function canCloseDeal(role: string): boolean {
  return CLOSE_ROLES.has(role);
}

// ---------------------------------------------------------------------------
// Closing requirements
// ---------------------------------------------------------------------------

// Marking a deal closed requires a negotiated value (> 0) and a planned payment method.
export function closingRequirementErrors(input: { negotiatedValue?: number | null; paymentMethod?: string | null }): string[] {
  const errors: string[] = [];
  if (input.negotiatedValue === null || input.negotiatedValue === undefined || !(input.negotiatedValue > 0)) {
    errors.push("negotiated_value");
  }
  if (!input.paymentMethod || input.paymentMethod.trim().length === 0) {
    errors.push("payment_method");
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Own-financing alert + release invariant
// ---------------------------------------------------------------------------

// When the customer uses their own financing, the value must land in the store account: alert
// the seller and management, and treat it as an operational block until manual conference.
export function requiresOwnFinancingAlert(financingType: FinancingType | null | undefined): boolean {
  return financingType === "CUSTOMER_OWN";
}

// Closing a deal NEVER releases documents, contract, receipt, transfer or delivery — that depends
// on the management/documentation flow. Kept as an explicit invariant.
export const CLOSING_RELEASES_DOCUMENTS = false as const;
