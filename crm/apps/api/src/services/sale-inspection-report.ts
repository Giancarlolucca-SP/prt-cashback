import type { Prisma } from "@prisma/client";

export const SALE_INSPECTION_REPORT_TYPES = ["CAUTIONARY", "TRANSFER"] as const;
export type SaleInspectionReportType = (typeof SALE_INSPECTION_REPORT_TYPES)[number];

export const SALE_INSPECTION_REPORT_STATUSES = [
  "PENDING",
  "REQUESTED",
  "PERFORMED",
  "ATTACHED",
  "CHECKED",
  "REJECTED",
  "EXPIRED",
  "WAIVED",
] as const;
export type SaleInspectionReportStatus = (typeof SALE_INSPECTION_REPORT_STATUSES)[number];

export const SALE_INSPECTION_REPORT_READY_STATUSES: ReadonlySet<SaleInspectionReportStatus> = new Set(["CHECKED", "WAIVED"]);

export type SaleInspectionReportSeedInput = Pick<
  Prisma.SaleGetPayload<Record<string, never>>,
  "id" | "storeId" | "vehicleId" | "customerId"
>;

const CAUTIONARY_RETENTION_DAYS = 730;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function findExistingCautionaryReport(tx: Prisma.TransactionClient, storeId: string, vehicleId: string) {
  const link = await tx.fileAttachmentLink.findFirst({
    where: {
      storeId,
      entityType: "vehicle",
      entityId: vehicleId,
      OR: [{ purpose: "cautionary_report" }, { purpose: "vehicle_cautionary_report" }, { purpose: "laudo_cautelar" }],
    },
    select: {
      attachmentId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (link?.attachmentId) {
    const attachment = await tx.fileAttachment.findFirst({
      where: { id: link.attachmentId, storeId, status: "ACTIVE", deletedAt: null },
      select: { id: true, createdAt: true },
    });
    if (attachment) {
      return { attachmentId: attachment.id, createdAt: attachment.createdAt, source: "file_attachment_link" };
    }
  }

  const vehicleLinks = await tx.fileAttachmentLink.findMany({
    where: {
      storeId,
      entityType: "vehicle",
      entityId: vehicleId,
    },
    select: { attachmentId: true },
    orderBy: { createdAt: "desc" },
  });
  const attachmentIds = vehicleLinks.map((item) => item.attachmentId);
  if (attachmentIds.length === 0) {
    return null;
  }

  const attachment = await tx.fileAttachment.findFirst({
    where: {
      id: { in: attachmentIds },
      storeId,
      status: "ACTIVE",
      deletedAt: null,
      classification: { in: ["cautionary_report", "vehicle_cautionary_report", "laudo_cautelar"] },
    },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  return attachment ? { attachmentId: attachment.id, createdAt: attachment.createdAt, source: "file_attachment" } : null;
}

export async function createMissingSaleInspectionReports(
  tx: Prisma.TransactionClient,
  storeId: string,
  sale: SaleInspectionReportSeedInput,
) {
  if (!sale.vehicleId) {
    return;
  }

  const existingCautionary = await findExistingCautionaryReport(tx, storeId, sale.vehicleId);
  const now = new Date();
  const reports = [
    {
      reportType: "CAUTIONARY" as const,
      status: existingCautionary ? "ATTACHED" : "PENDING",
      reportFileId: existingCautionary?.attachmentId ?? null,
      reportDate: existingCautionary?.createdAt ?? null,
      retentionUntil: addDays(existingCautionary?.createdAt ?? now, CAUTIONARY_RETENTION_DAYS),
      deleteAfterRetentionStatus: "PENDING_POLICY_REVIEW",
      metadata: {
        source: "s3_us04",
        retentionPolicyDays: CAUTIONARY_RETENTION_DAYS,
        autoLinkedFrom: existingCautionary?.source ?? null,
      },
    },
    {
      reportType: "TRANSFER" as const,
      status: "PENDING",
      reportFileId: null,
      reportDate: null,
      retentionUntil: null,
      deleteAfterRetentionStatus: null,
      metadata: { source: "s3_us04", responsibility: "store_administrative" },
    },
  ];

  await tx.saleInspectionReport.createMany({
    data: reports.map((report) => ({
      storeId,
      saleId: sale.id,
      vehicleId: sale.vehicleId as string,
      customerId: sale.customerId,
      reportType: report.reportType,
      status: report.status,
      reportFileId: report.reportFileId,
      reportDate: report.reportDate,
      retentionUntil: report.retentionUntil,
      deleteAfterRetentionStatus: report.deleteAfterRetentionStatus,
      metadata: report.metadata as Prisma.InputJsonObject,
    })),
    skipDuplicates: true,
  });
}

export function isSaleInspectionReportReady(input: { isRequired: boolean; status: string }) {
  if (!input.isRequired) {
    return true;
  }
  return SALE_INSPECTION_REPORT_READY_STATUSES.has(input.status as SaleInspectionReportStatus);
}

export function inspectionReportBlockers<T extends { reportType: string; status: string; isRequired: boolean }>(reports: T[]) {
  return reports
    .filter((report) => !isSaleInspectionReportReady(report))
    .map((report) => ({
      reportType: report.reportType,
      status: report.status,
      reason: "required_report_pending",
    }));
}

export function requiredSaleInspectionReportBlockers<T extends { reportType: string; status: string; isRequired: boolean }>(reports: T[]) {
  const requiredTypesPresent = new Set(reports.filter((report) => report.isRequired).map((report) => report.reportType));
  const missingRequiredReports = SALE_INSPECTION_REPORT_TYPES.filter((reportType) => !requiredTypesPresent.has(reportType)).map((reportType) => ({
    reportType,
    status: "MISSING",
    reason: "required_report_missing",
  }));

  return [...missingRequiredReports, ...inspectionReportBlockers(reports)];
}

export function summarizeSaleInspectionReports<T extends { reportType: string; status: string; isRequired: boolean }>(reports: T[]) {
  const blockers = inspectionReportBlockers(reports);
  return {
    total: reports.length,
    required: reports.filter((report) => report.isRequired).length,
    ready: reports.filter((report) => isSaleInspectionReportReady(report)).length,
    blockedForRelease: blockers.length > 0,
    blockers,
  };
}
