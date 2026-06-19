import type { Prisma } from "@prisma/client";

export const PAYMENT_CHECK_DIRECTIONS = ["INCOME", "EXPENSE"] as const;
export type PaymentCheckDirection = (typeof PAYMENT_CHECK_DIRECTIONS)[number];

export const PAYMENT_CHECK_STATUSES = [
  "PENDING",
  "AWAITING_ACCOUNT",
  "PARTIAL_RECEIVED",
  "CONFIRMED_RECEIVED",
  "DIVERGENT",
  "PROOF_RECEIVED",
  "CONFIRMED_PAID",
  "CANCELLED_REFUNDED",
] as const;
export type PaymentCheckStatus = (typeof PAYMENT_CHECK_STATUSES)[number];

export const PAYMENT_RELEASE_STATUSES = ["BLOCKED", "BLOCKED_FOR_RELEASE", "RELEASED_FOR_DOCUMENTATION"] as const;
export type PaymentReleaseStatus = (typeof PAYMENT_RELEASE_STATUSES)[number];

export const PAYMENT_RELEASED_STATUS: PaymentReleaseStatus = "RELEASED_FOR_DOCUMENTATION";
export const PAYMENT_BLOCKING_RELEASE_STATUSES: ReadonlySet<PaymentReleaseStatus> = new Set(["BLOCKED", "BLOCKED_FOR_RELEASE"]);

export type SalePaymentCheckSeedInput = Pick<
  Prisma.SaleGetPayload<Record<string, never>>,
  "id" | "salePrice" | "paymentMethodForecast" | "hasFinancing" | "financingType" | "closedAt"
>;

export type SalePaymentCheckSeedItem = {
  paymentItemType: string;
  direction: PaymentCheckDirection;
  expectedAmount: number;
  paymentMethod: string | null;
  expectedAt: Date | null;
  metadata: Record<string, unknown>;
};

function decimalToNumber(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === "number" ? value : Number(value.toString());
}

export function buildRequiredSalePaymentChecks(sale: SalePaymentCheckSeedInput): SalePaymentCheckSeedItem[] {
  const expectedAmount = decimalToNumber(sale.salePrice);
  if (!(expectedAmount > 0)) {
    return [];
  }

  const ownFinancing = sale.financingType === "CUSTOMER_OWN";
  const paymentItemType = ownFinancing ? "own_financing_received_store_account" : "sale_payment_received";
  const paymentMethod = sale.paymentMethodForecast ?? (ownFinancing ? "financiamento proprio do comprador" : null);

  return [
    {
      paymentItemType,
      direction: "INCOME",
      expectedAmount,
      paymentMethod,
      expectedAt: sale.closedAt ?? null,
      metadata: {
        source: "s3_us02",
        financingType: sale.financingType,
        hasFinancing: sale.hasFinancing,
        ownFinancingRequiresStoreAccount: ownFinancing,
      },
    },
  ];
}

export async function createMissingSalePaymentChecks(
  tx: Prisma.TransactionClient,
  storeId: string,
  sale: SalePaymentCheckSeedInput,
) {
  const items = buildRequiredSalePaymentChecks(sale);
  if (items.length === 0) {
    return;
  }

  await tx.salePaymentCheck.createMany({
    data: items.map((item) => ({
      storeId,
      saleId: sale.id,
      paymentItemType: item.paymentItemType,
      direction: item.direction,
      expectedAmount: item.expectedAmount,
      pendingAmount: item.expectedAmount,
      paymentMethod: item.paymentMethod,
      expectedAt: item.expectedAt,
      paymentStatus: "PENDING",
      releaseStatus: "BLOCKED",
      metadata: item.metadata as Prisma.InputJsonObject,
    })),
    skipDuplicates: true,
  });
}

export function isPaymentCheckReleased(input: { isRequired: boolean; releaseStatus: string }) {
  if (!input.isRequired) {
    return true;
  }
  return input.releaseStatus === PAYMENT_RELEASED_STATUS;
}

export function summarizeSalePaymentChecks<T extends { isRequired: boolean; releaseStatus: string; pendingAmount: { toString(): string } | null }>(
  checks: T[],
) {
  const blocking = checks.filter((check) => !isPaymentCheckReleased(check));
  return {
    total: checks.length,
    required: checks.filter((check) => check.isRequired).length,
    released: checks.filter((check) => isPaymentCheckReleased(check)).length,
    blocked: blocking.length,
    pendingAmount: checks.reduce((sum, check) => sum + decimalToNumber(check.pendingAmount), 0).toFixed(2),
    blockedForRelease: blocking.length > 0,
  };
}
