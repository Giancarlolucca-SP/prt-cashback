import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission, type AuthenticatedContext } from "../api/auth-guards.js";
import { isCommercialFullView } from "../auth/commercial-scope.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { prisma } from "../lib/db.js";
import { ensureSaleDossier } from "../services/sale-dossier.js";

const saleDossierParamsSchema = z.object({ saleId: z.string().uuid() });
const dossierDocumentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(50),
  document_type: z.string().trim().max(80).optional(),
  source_module: z.string().trim().max(80).optional(),
});

const dossierEventsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(50),
  event_type: z.string().trim().max(80).optional(),
  source_module: z.string().trim().max(80).optional(),
});

const attachDossierDocumentSchema = z.object({
  attachmentId: z.string().uuid(),
  documentType: z.string().trim().min(2).max(80),
  sourceModule: z.string().trim().min(2).max(80).default("manual"),
  sourceEntityType: z.string().trim().max(80).nullable().optional(),
  sourceEntityId: z.string().trim().max(120).nullable().optional(),
  responsibleUserId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

type SaleRecord = Prisma.SaleGetPayload<Record<string, never>>;
type DossierEventInput = {
  eventType: string;
  sourceModule: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  actorUserId?: string | null;
  occurredAt: Date;
  fromStatus?: string | null;
  toStatus?: string | null;
  payload?: Prisma.InputJsonObject;
};

const deliveredNoticeStatuses = new Set(["SENT", "DELIVERED", "RESENT"]);
const terminalDispatchStatuses = new Set(["COMPLETED", "CANCELLED"]);

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function decimalToNumber(value: { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

function money(value: number) {
  return value.toFixed(2);
}

function hoursBetween(start: Date | null | undefined, end: Date | null | undefined) {
  if (!start || !end) return null;
  return Math.round(((end.getTime() - start.getTime()) / 36_000) ) / 100;
}

function average(values: Array<number | null>) {
  const numbers = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numbers.length === 0) return null;
  return Math.round((numbers.reduce((total, value) => total + value, 0) / numbers.length) * 100) / 100;
}

function sourceModuleForEntity(entityType: string) {
  const modules: Record<string, string> = {
    sale: "commercial_sales",
    customer: "customers",
    vehicle: "inventory",
    contract: "contracts",
    contract_document_package: "contracts",
    warranty_term: "contracts",
    dispatcher_process: "dispatch",
    dispatch_document_ready: "dispatch",
    buyer_document_ready_notification: "dispatch",
    sale_payment_check: "finance",
    financial_transaction: "finance",
    sale_inspection_report: "documents",
    technical_delivery: "technical_deliveries",
  };
  return modules[entityType] ?? "files";
}

function serializeDossier(dossier: Prisma.SaleDossierGetPayload<Record<string, never>>) {
  return {
    id: dossier.id,
    storeId: dossier.storeId,
    saleId: dossier.saleId,
    vehicleId: dossier.vehicleId,
    buyerId: dossier.buyerId,
    sellerUserId: dossier.sellerUserId,
    leadId: dossier.leadId,
    status: dossier.status,
    openedAt: dossier.openedAt.toISOString(),
    closedAt: iso(dossier.closedAt),
    lastEventAt: iso(dossier.lastEventAt),
    summary: dossier.summary,
    metricsSnapshot: dossier.metricsSnapshot,
    createdAt: dossier.createdAt.toISOString(),
    updatedAt: dossier.updatedAt.toISOString(),
  };
}

function serializeDocument(document: Prisma.SaleDossierDocumentGetPayload<Record<string, never>>) {
  return {
    id: document.id,
    saleDossierId: document.saleDossierId,
    saleId: document.saleId,
    vehicleId: document.vehicleId,
    buyerId: document.buyerId,
    attachmentId: document.attachmentId,
    documentType: document.documentType,
    sourceModule: document.sourceModule,
    sourceEntityType: document.sourceEntityType,
    sourceEntityId: document.sourceEntityId,
    origin: document.origin,
    responsibleUserId: document.responsibleUserId,
    capturedAt: document.capturedAt.toISOString(),
    metadata: document.metadata,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function serializeEvent(event: Prisma.SaleDossierEventGetPayload<Record<string, never>>) {
  return {
    id: event.id,
    saleDossierId: event.saleDossierId,
    saleId: event.saleId,
    eventType: event.eventType,
    sourceModule: event.sourceModule,
    sourceEntityType: event.sourceEntityType,
    sourceEntityId: event.sourceEntityId,
    actorUserId: event.actorUserId,
    occurredAt: event.occurredAt.toISOString(),
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    payload: event.payload,
    createdAt: event.createdAt.toISOString(),
  };
}

async function loadDossierSale(session: AuthenticatedContext, saleId: string) {
  const sale = await prisma.sale.findFirst({ where: { id: saleId, storeId: session.user.storeId, deletedAt: null } });
  if (!sale) {
    throw new ApiError("NOT_FOUND", "Dossie da venda nao encontrado.");
  }
  if (!isCommercialFullView(session.user.role) && sale.sellerUserId !== session.user.id) {
    throw new ApiError("NOT_FOUND", "Dossie da venda nao encontrado.");
  }
  if (session.user.role === "SDR") {
    throw new ApiError("FORBIDDEN", "SDR nao possui acesso ao dossie digital da venda.");
  }
  return sale;
}

function linkTargetsForSale(input: {
  sale: SaleRecord;
  contracts: Array<{ id: string }>;
  packages: Array<{ id: string }>;
  warrantyTerms: Array<{ id: string }>;
  paymentChecks: Array<{ id: string }>;
  inspectionReports: Array<{ id: string }>;
  dispatchProcesses: Array<{ id: string }>;
  dispatchDocuments: Array<{ id: string }>;
  buyerNotices: Array<{ id: string }>;
  technicalDeliveries: Array<{ id: string }>;
  financialTransactions: Array<{ id: string }>;
}) {
  const targets = [
    { entityType: "sale", entityId: input.sale.id },
    input.sale.customerId ? { entityType: "customer", entityId: input.sale.customerId } : null,
    input.sale.vehicleId ? { entityType: "vehicle", entityId: input.sale.vehicleId } : null,
    ...input.contracts.map((item) => ({ entityType: "contract", entityId: item.id })),
    ...input.packages.map((item) => ({ entityType: "contract_document_package", entityId: item.id })),
    ...input.warrantyTerms.map((item) => ({ entityType: "warranty_term", entityId: item.id })),
    ...input.paymentChecks.map((item) => ({ entityType: "sale_payment_check", entityId: item.id })),
    ...input.inspectionReports.map((item) => ({ entityType: "sale_inspection_report", entityId: item.id })),
    ...input.dispatchProcesses.map((item) => ({ entityType: "dispatcher_process", entityId: item.id })),
    ...input.dispatchDocuments.map((item) => ({ entityType: "dispatch_document_ready", entityId: item.id })),
    ...input.buyerNotices.map((item) => ({ entityType: "buyer_document_ready_notification", entityId: item.id })),
    ...input.technicalDeliveries.map((item) => ({ entityType: "technical_delivery", entityId: item.id })),
    ...input.financialTransactions.map((item) => ({ entityType: "financial_transaction", entityId: item.id })),
  ].filter((target): target is { entityType: string; entityId: string } => Boolean(target));

  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = `${target.entityType}:${target.entityId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildEvents(input: {
  sale: SaleRecord;
  checklist: Array<Prisma.SaleDocumentChecklistGetPayload<Record<string, never>>>;
  contracts: Array<Prisma.ContractGetPayload<Record<string, never>>>;
  packages: Array<Prisma.ContractDocumentPackageGetPayload<Record<string, never>>>;
  warrantyTerms: Array<Prisma.WarrantyTermGetPayload<Record<string, never>>>;
  paymentChecks: Array<Prisma.SalePaymentCheckGetPayload<Record<string, never>>>;
  inspectionReports: Array<Prisma.SaleInspectionReportGetPayload<Record<string, never>>>;
  dispatchProcesses: Array<Prisma.DispatcherProcessGetPayload<Record<string, never>>>;
  dispatchDocuments: Array<Prisma.DispatchDocumentReadyGetPayload<Record<string, never>>>;
  buyerNotices: Array<Prisma.BuyerDocumentReadyNotificationGetPayload<Record<string, never>>>;
  technicalDeliveries: Array<Prisma.TechnicalDeliveryGetPayload<Record<string, never>>>;
  financialTransactions: Array<Prisma.FinancialTransactionGetPayload<Record<string, never>>>;
  additionalItems: Array<Prisma.SaleAdditionalRevenueItemGetPayload<Record<string, never>>>;
  additionalCosts: Array<Prisma.SaleAdditionalCostGetPayload<Record<string, never>>>;
}) {
  const events: DossierEventInput[] = [];
  if (input.sale.closedAt) {
    events.push({
      eventType: "sale_closed_for_documentation",
      sourceModule: "commercial_sales",
      sourceEntityType: "sale",
      sourceEntityId: input.sale.id,
      occurredAt: input.sale.closedAt,
      toStatus: input.sale.status,
      payload: { salePrice: input.sale.salePrice?.toString() ?? null, financingType: input.sale.financingType ?? null },
    });
  }

  for (const item of input.checklist) {
    events.push({
      eventType: item.isDone ? "buyer_document_item_done" : "buyer_document_item_pending",
      sourceModule: "commercial_sales",
      sourceEntityType: "sale_document_checklist",
      sourceEntityId: item.id,
      actorUserId: item.checkedByUserId ?? item.responsibleUserId,
      occurredAt: item.completedAt ?? item.checkedAt ?? item.updatedAt,
      toStatus: item.status,
      payload: { itemKey: item.itemKey, isRequired: item.isRequired, attachmentId: item.attachmentId ?? null },
    });
  }
  for (const contract of input.contracts) {
    events.push({
      eventType: contract.status === "SIGNED" ? "contract_signed" : "contract_generated",
      sourceModule: "contracts",
      sourceEntityType: "contract",
      sourceEntityId: contract.id,
      occurredAt: contract.signedAt ?? contract.generatedAt,
      toStatus: contract.status,
      payload: { version: contract.version },
    });
  }
  for (const item of input.packages) {
    events.push({
      eventType: "contract_package_status",
      sourceModule: "contracts",
      sourceEntityType: "contract_document_package",
      sourceEntityId: item.id,
      actorUserId: item.reviewedByUserId,
      occurredAt: item.signedAt ?? item.sentAt ?? item.reviewedAt ?? item.updatedAt,
      toStatus: item.status,
      payload: {
        contractId: item.contractId ?? null,
        signedFileId: item.signedFileId ?? null,
        sellerSignatureStatus: item.sellerSignatureStatus,
        buyerSignatureStatus: item.buyerSignatureStatus,
        atpveStatus: item.atpveStatus,
      },
    });
  }
  for (const term of input.warrantyTerms) {
    events.push({
      eventType: term.signedStatus === "SIGNED" ? "warranty_term_signed" : "warranty_term_status",
      sourceModule: "contracts",
      sourceEntityType: "warranty_term",
      sourceEntityId: term.id,
      actorUserId: term.signedConfirmedByUserId ?? term.printedByUserId,
      occurredAt: term.signedConfirmedAt ?? term.printedAt ?? term.generatedAt ?? term.updatedAt,
      toStatus: term.signedStatus,
      payload: { status: term.status, generatedFileId: term.generatedFileId ?? null, allDocumentsSignedStatus: term.allDocumentsSignedStatus },
    });
  }
  for (const check of input.paymentChecks) {
    events.push({
      eventType: check.releaseStatus === "RELEASED_FOR_DOCUMENTATION" ? "payment_released_for_documentation" : "payment_pending_release",
      sourceModule: "finance",
      sourceEntityType: "sale_payment_check",
      sourceEntityId: check.id,
      actorUserId: check.checkedByUserId ?? check.releaseApprovedByUserId,
      occurredAt: check.releaseApprovedAt ?? check.checkedAt ?? check.updatedAt,
      toStatus: check.releaseStatus,
      payload: { paymentItemType: check.paymentItemType, paymentStatus: check.paymentStatus, expectedAmount: check.expectedAmount.toString() },
    });
  }
  for (const transaction of input.financialTransactions) {
    events.push({
      eventType: transaction.status === "PAID" ? "financial_transaction_paid" : "financial_transaction_status",
      sourceModule: "finance",
      sourceEntityType: "financial_transaction",
      sourceEntityId: transaction.id,
      occurredAt: transaction.paidAt ?? transaction.updatedAt,
      toStatus: transaction.status,
      payload: { type: transaction.type, amount: transaction.amount.toString(), description: transaction.description },
    });
  }
  for (const report of input.inspectionReports) {
    events.push({
      eventType: report.status === "CHECKED" ? "inspection_report_checked" : "inspection_report_pending",
      sourceModule: "documents",
      sourceEntityType: "sale_inspection_report",
      sourceEntityId: report.id,
      actorUserId: report.checkedByUserId ?? report.printedByUserId ?? report.exportedByUserId,
      occurredAt: report.checkedAt ?? report.printedAt ?? report.exportedAt ?? report.updatedAt,
      toStatus: report.status,
      payload: { reportType: report.reportType, reportFileId: report.reportFileId ?? null, requestedByCustomer: report.requestedByCustomer },
    });
  }
  for (const process of input.dispatchProcesses) {
    events.push({
      eventType: "dispatch_process_status",
      sourceModule: "dispatch",
      sourceEntityType: "dispatcher_process",
      sourceEntityId: process.id,
      actorUserId: process.sentByUserId ?? process.printedByUserId,
      occurredAt: process.deliveredToDispatcherAt ?? process.sentAt ?? process.printedAt ?? process.updatedAt,
      toStatus: process.status,
      payload: { packageStatus: process.packageStatus, protocolNumber: process.protocolNumber ?? null, protocolFileId: process.protocolFileId ?? null },
    });
  }
  for (const document of input.dispatchDocuments) {
    events.push({
      eventType: "vehicle_document_ready",
      sourceModule: "dispatch",
      sourceEntityType: "dispatch_document_ready",
      sourceEntityId: document.id,
      actorUserId: document.linkedByUserId,
      occurredAt: document.receivedAt,
      toStatus: document.status,
      payload: { documentType: document.documentType, fileId: document.fileId ?? null, sourceChannel: document.sourceChannel },
    });
  }
  for (const notice of input.buyerNotices) {
    events.push({
      eventType: deliveredNoticeStatuses.has(notice.status) ? "buyer_document_ready_notice_sent" : "buyer_document_ready_notice_pending",
      sourceModule: "dispatch",
      sourceEntityType: "buyer_document_ready_notification",
      sourceEntityId: notice.id,
      actorUserId: notice.sentByUserId,
      occurredAt: notice.sentAt ?? notice.createdAt,
      toStatus: notice.status,
      payload: { documentReadyId: notice.documentReadyId, channel: notice.channel, retryCount: notice.retryCount },
    });
  }
  for (const delivery of input.technicalDeliveries) {
    events.push({
      eventType: delivery.status === "COMPLETED_SIGNED" ? "technical_delivery_completed" : "technical_delivery_scheduled",
      sourceModule: "technical_deliveries",
      sourceEntityType: "technical_delivery",
      sourceEntityId: delivery.id,
      actorUserId: delivery.scheduledByUserId,
      occurredAt: delivery.completedAt ?? delivery.scheduledAt,
      toStatus: delivery.status,
      payload: { scheduledAt: delivery.scheduledAt.toISOString(), documentFileId: delivery.documentFileId ?? null, signedCopyFileId: delivery.signedCopyFileId ?? null },
    });
  }
  for (const item of input.additionalItems) {
    events.push({
      eventType: "additional_revenue_item",
      sourceModule: "commercial_sales",
      sourceEntityType: "sale_additional_revenue_item",
      sourceEntityId: item.id,
      actorUserId: item.soldByUserId,
      occurredAt: item.soldAt,
      toStatus: item.itemStatus,
      payload: { itemType: item.itemType, chargedAmount: item.chargedAmount.toString(), includedInVehiclePrice: item.includedInVehiclePrice },
    });
  }
  for (const cost of input.additionalCosts) {
    events.push({
      eventType: "additional_revenue_cost",
      sourceModule: "commercial_sales",
      sourceEntityType: "sale_additional_cost",
      sourceEntityId: cost.id,
      actorUserId: cost.launchedByUserId,
      occurredAt: cost.costDate ?? cost.updatedAt,
      toStatus: cost.costStatus,
      payload: {
        additionalRevenueItemId: cost.additionalRevenueItemId,
        expectedCostAmount: cost.expectedCostAmount?.toString() ?? null,
        realizedCostAmount: cost.realizedCostAmount?.toString() ?? null,
      },
    });
  }
  return events.sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
}

async function rebuildDossier(storeId: string, sale: SaleRecord, actorUserId?: string | null) {
  const [
    checklist,
    contracts,
    packages,
    warrantyTerms,
    paymentChecks,
    inspectionReports,
    dispatchProcesses,
    dispatchDocuments,
    buyerNotices,
    technicalDeliveries,
    financialTransactions,
    additionalItems,
    additionalCosts,
  ] = await Promise.all([
    prisma.saleDocumentChecklist.findMany({ where: { storeId, saleId: sale.id }, orderBy: { createdAt: "asc" } }),
    prisma.contract.findMany({ where: { storeId, saleId: sale.id }, orderBy: { generatedAt: "asc" } }),
    prisma.contractDocumentPackage.findMany({ where: { storeId, saleId: sale.id }, orderBy: { createdAt: "asc" } }),
    prisma.warrantyTerm.findMany({ where: { storeId, saleId: sale.id }, orderBy: { createdAt: "asc" } }),
    prisma.salePaymentCheck.findMany({ where: { storeId, saleId: sale.id }, orderBy: { createdAt: "asc" } }),
    prisma.saleInspectionReport.findMany({ where: { storeId, saleId: sale.id }, orderBy: { createdAt: "asc" } }),
    prisma.dispatcherProcess.findMany({ where: { storeId, saleId: sale.id }, orderBy: { createdAt: "asc" } }),
    prisma.dispatchDocumentReady.findMany({ where: { storeId, saleId: sale.id }, orderBy: { createdAt: "asc" } }),
    prisma.buyerDocumentReadyNotification.findMany({ where: { storeId, saleId: sale.id }, orderBy: { createdAt: "asc" } }),
    prisma.technicalDelivery.findMany({ where: { storeId, saleId: sale.id }, orderBy: { createdAt: "asc" } }),
    prisma.financialTransaction.findMany({ where: { storeId, entityType: "sale", entityId: sale.id, deletedAt: null }, orderBy: { createdAt: "asc" } }),
    prisma.saleAdditionalRevenueItem.findMany({ where: { storeId, saleId: sale.id }, orderBy: { createdAt: "asc" } }),
    prisma.saleAdditionalCost.findMany({ where: { storeId, saleId: sale.id }, orderBy: { createdAt: "asc" } }),
  ]);

  const revenueTotal = additionalItems.reduce((total, item) => total + decimalToNumber(item.chargedAmount), 0);
  const costTotal = additionalCosts.reduce((total, item) => total + decimalToNumber(item.realizedCostAmount ?? item.expectedCostAmount), 0);
  const checklistPending = checklist.filter((item) => item.isRequired && !item.isDone);
  const paymentReleased = paymentChecks.length > 0 && paymentChecks.every((item) => item.releaseStatus === "RELEASED_FOR_DOCUMENTATION");
  const paidIncome = financialTransactions.some((item) => item.type === "INCOME" && item.status === "PAID");
  const contractSigned = contracts.some((item) => item.status === "SIGNED" && item.signedAt);
  const warrantySigned = warrantyTerms.some((item) => item.signedStatus === "SIGNED" && item.signedConfirmedAt);
  const requiredInspectionPending = inspectionReports.filter((item) => item.isRequired && item.status !== "CHECKED");
  const dispatchPending = dispatchProcesses.filter((item) => !terminalDispatchStatuses.has(item.status));
  const documentsReadyAwaitingBuyerNotice = dispatchDocuments.filter(
    (document) => !buyerNotices.some((notice) => notice.documentReadyId === document.id && deliveredNoticeStatuses.has(notice.status)),
  );
  const technicalDelivery = technicalDeliveries[technicalDeliveries.length - 1] ?? null;
  const documentReadyAt = dispatchDocuments[0]?.receivedAt ?? null;
  const events = buildEvents({
    sale,
    checklist,
    contracts,
    packages,
    warrantyTerms,
    paymentChecks,
    inspectionReports,
    dispatchProcesses,
    dispatchDocuments,
    buyerNotices,
    technicalDeliveries,
    financialTransactions,
    additionalItems,
    additionalCosts,
  });
  const metrics = {
    sale: {
      status: sale.status,
      salePrice: sale.salePrice?.toString() ?? null,
      grossMargin: sale.grossMargin?.toString() ?? null,
      closedAt: iso(sale.closedAt),
    },
    prerequisites: {
      buyerDocumentsDelivered: checklist.some((item) => item.itemKey === "buyer_document_delivered" && item.isDone),
      buyerDocumentsChecked: checklist.some((item) => item.itemKey === "buyer_document_checked" && item.isDone),
      contractSigned,
      warrantySigned,
      paymentConfirmed: paymentReleased || paidIncome,
      inspectionsChecked: requiredInspectionPending.length === 0 && inspectionReports.some((item) => item.isRequired),
    },
    documents: {
      checklistTotal: checklist.length,
      checklistRequired: checklist.filter((item) => item.isRequired).length,
      checklistDone: checklist.filter((item) => item.isDone).length,
      checklistPending: checklistPending.length,
      generatedContracts: contracts.length,
      signedContracts: contracts.filter((item) => item.status === "SIGNED").length,
      warrantyTerms: warrantyTerms.length,
      dispatchDocumentsReady: dispatchDocuments.length,
      buyerNoticesSent: buyerNotices.filter((item) => deliveredNoticeStatuses.has(item.status)).length,
    },
    finance: {
      paymentChecks: paymentChecks.length,
      paymentReleased,
      paidIncome,
      additionalRevenueTotal: money(revenueTotal),
      additionalCostTotal: money(costTotal),
      additionalSpreadTotal: money(revenueTotal - costTotal),
    },
    operations: {
      pendingInspectionReports: requiredInspectionPending.map((item) => item.reportType),
      pendingDispatchProcesses: dispatchPending.length,
      documentsReadyAwaitingBuyerNotice: documentsReadyAwaitingBuyerNotice.length,
      technicalDeliveryStatus: technicalDelivery?.status ?? null,
      technicalDeliveryScheduledAt: iso(technicalDelivery?.scheduledAt),
    },
    sla: {
      closedToDocumentReadyHours: hoursBetween(sale.closedAt, documentReadyAt),
      closedToTechnicalDeliveryHours: hoursBetween(sale.closedAt, technicalDelivery?.scheduledAt),
    },
  };
  const summary = {
    source: "sale_dossier_rebuild",
    actorUserId: actorUserId ?? null,
    refreshedAt: new Date().toISOString(),
    metrics,
  } satisfies Prisma.InputJsonObject;

  const dossier = await prisma.$transaction(async (tx) => {
    const current = await ensureSaleDossier(tx, sale, { actorUserId, summary });
    const targets = linkTargetsForSale({
      sale,
      contracts,
      packages,
      warrantyTerms,
      paymentChecks,
      inspectionReports,
      dispatchProcesses,
      dispatchDocuments,
      buyerNotices,
      technicalDeliveries,
      financialTransactions,
    });
    const links =
      targets.length > 0
        ? await tx.fileAttachmentLink.findMany({
            where: {
              AND: [
                { OR: [{ storeId }, { storeId: null }] },
                { OR: targets.map((target) => ({ entityType: target.entityType, entityId: target.entityId })) },
              ],
            },
            orderBy: { createdAt: "asc" },
          })
        : [];
    const attachments = links.length
      ? await tx.fileAttachment.findMany({
          where: {
            id: { in: [...new Set(links.map((link) => link.attachmentId))] },
            deletedAt: null,
            status: { in: ["ACTIVE", "RETAINED"] },
          },
        })
      : [];
    const attachmentsById = new Map(attachments.map((attachment) => [attachment.id, attachment]));

    for (const link of links) {
      const attachment = attachmentsById.get(link.attachmentId);
      if (!attachment) continue;
      const documentType = link.purpose ?? attachment.classification ?? "unclassified";
      await tx.saleDossierDocument.upsert({
        where: { saleDossierId_attachmentId_documentType: { saleDossierId: current.id, attachmentId: attachment.id, documentType } },
        update: {
          vehicleId: sale.vehicleId,
          buyerId: sale.customerId,
          sourceModule: sourceModuleForEntity(link.entityType),
          sourceEntityType: link.entityType,
          sourceEntityId: link.entityId,
          metadata: {
            fileName: attachment.originalName,
            mimeType: attachment.mimeType ?? null,
            sizeBytes: attachment.sizeBytes ?? null,
            purpose: link.purpose ?? null,
            classification: attachment.classification ?? null,
          },
        },
        create: {
          storeId,
          saleDossierId: current.id,
          saleId: sale.id,
          vehicleId: sale.vehicleId,
          buyerId: sale.customerId,
          attachmentId: attachment.id,
          documentType,
          sourceModule: sourceModuleForEntity(link.entityType),
          sourceEntityType: link.entityType,
          sourceEntityId: link.entityId,
          origin: "SYSTEM",
          responsibleUserId: attachment.uploadedByUserId,
          capturedAt: link.createdAt,
          metadata: {
            fileName: attachment.originalName,
            mimeType: attachment.mimeType ?? null,
            sizeBytes: attachment.sizeBytes ?? null,
            purpose: link.purpose ?? null,
            classification: attachment.classification ?? null,
          },
        },
      });
    }

    await tx.saleDossierEvent.deleteMany({ where: { storeId, saleDossierId: current.id, sourceModule: "sale_dossier_sync" } });
    if (events.length > 0) {
      await tx.saleDossierEvent.createMany({
        data: events.map((event) => ({
          storeId,
          saleDossierId: current.id,
          saleId: sale.id,
          eventType: event.eventType,
          sourceModule: "sale_dossier_sync",
          sourceEntityType: event.sourceEntityType ?? null,
          sourceEntityId: event.sourceEntityId ?? null,
          actorUserId: event.actorUserId ?? null,
          occurredAt: event.occurredAt,
          fromStatus: event.fromStatus ?? null,
          toStatus: event.toStatus ?? null,
          payload: { ...(event.payload ?? {}), sourceModule: event.sourceModule },
        })),
      });
    }
    return tx.saleDossier.update({ where: { id: current.id }, data: { metricsSnapshot: metrics as Prisma.InputJsonObject, lastEventAt: new Date() } });
  });

  const [documents, recentEvents] = await Promise.all([
    prisma.saleDossierDocument.findMany({ where: { storeId, saleDossierId: dossier.id }, orderBy: { capturedAt: "desc" }, take: 25 }),
    prisma.saleDossierEvent.findMany({ where: { storeId, saleDossierId: dossier.id }, orderBy: { occurredAt: "desc" }, take: 25 }),
  ]);

  return {
    dossier,
    metrics,
    documents,
    recentEvents,
  };
}

async function buildDashboardSummary(storeId: string) {
  const sales = await prisma.sale.findMany({
    where: { storeId, deletedAt: null, status: { in: ["DOCUMENTATION", "CLOSED"] } },
    orderBy: { closedAt: "desc" },
  });
  const saleIds = sales.map((sale) => sale.id);
  if (saleIds.length === 0) {
    return {
      totals: { administrativeSales: 0, openDossiers: 0 },
      queues: { awaitingPayment: 0, awaitingSignature: 0, awaitingInspection: 0, awaitingDispatch: 0, documentsReadyAwaitingBuyerNotice: 0 },
      averages: { documentCompletionHours: null, technicalDeliveryHours: null },
      additionalRevenue: { totalRevenue: "0.00", totalCost: "0.00", totalSpread: "0.00" },
      bottlenecks: [],
      overduePendingProcesses: [],
    };
  }

  const [dossiers, checklist, paymentChecks, contracts, warrantyTerms, inspectionReports, dispatchProcesses, dispatchDocs, buyerNotices, technicalDeliveries, additionalItems, additionalCosts] =
    await Promise.all([
      prisma.saleDossier.findMany({ where: { storeId, saleId: { in: saleIds } } }),
      prisma.saleDocumentChecklist.findMany({ where: { storeId, saleId: { in: saleIds } } }),
      prisma.salePaymentCheck.findMany({ where: { storeId, saleId: { in: saleIds } } }),
      prisma.contract.findMany({ where: { storeId, saleId: { in: saleIds } } }),
      prisma.warrantyTerm.findMany({ where: { storeId, saleId: { in: saleIds } } }),
      prisma.saleInspectionReport.findMany({ where: { storeId, saleId: { in: saleIds } } }),
      prisma.dispatcherProcess.findMany({ where: { storeId, saleId: { in: saleIds } } }),
      prisma.dispatchDocumentReady.findMany({ where: { storeId, saleId: { in: saleIds } } }),
      prisma.buyerDocumentReadyNotification.findMany({ where: { storeId, saleId: { in: saleIds } } }),
      prisma.technicalDelivery.findMany({ where: { storeId, saleId: { in: saleIds } } }),
      prisma.saleAdditionalRevenueItem.findMany({ where: { storeId, saleId: { in: saleIds } } }),
      prisma.saleAdditionalCost.findMany({ where: { storeId, saleId: { in: saleIds } } }),
    ]);

  const salesById = new Map(sales.map((sale) => [sale.id, sale]));
  const saleHasReleasedPayment = new Set(
    paymentChecks.filter((check) => check.releaseStatus === "RELEASED_FOR_DOCUMENTATION").map((check) => check.saleId),
  );
  const saleHasSignedContract = new Set(contracts.filter((contract) => contract.status === "SIGNED" && contract.signedAt).map((contract) => contract.saleId));
  const saleHasSignedWarranty = new Set(warrantyTerms.filter((term) => term.signedStatus === "SIGNED" && term.signedConfirmedAt).map((term) => term.saleId));
  const saleHasTechnicalDelivery = new Set(technicalDeliveries.map((delivery) => delivery.saleId));
  const awaitingPayment = new Set(paymentChecks.filter((check) => check.releaseStatus !== "RELEASED_FOR_DOCUMENTATION").map((check) => check.saleId));
  const awaitingSignature = sales.filter((sale) => !saleHasSignedContract.has(sale.id) || !saleHasSignedWarranty.has(sale.id)).length;
  const awaitingInspection = new Set(inspectionReports.filter((report) => report.isRequired && report.status !== "CHECKED").map((report) => report.saleId));
  const awaitingDispatch = new Set(dispatchProcesses.filter((process) => !terminalDispatchStatuses.has(process.status)).map((process) => process.saleId));
  const documentsReadyAwaitingBuyerNotice = dispatchDocs.filter(
    (document) => !buyerNotices.some((notice) => notice.documentReadyId === document.id && deliveredNoticeStatuses.has(notice.status)),
  );
  const revenueTotal = additionalItems.reduce((total, item) => total + decimalToNumber(item.chargedAmount), 0);
  const costTotal = additionalCosts.reduce((total, item) => total + decimalToNumber(item.realizedCostAmount ?? item.expectedCostAmount), 0);
  const documentCompletionHours = average(dispatchDocs.map((document) => hoursBetween(salesById.get(document.saleId)?.closedAt, document.receivedAt)));
  const technicalDeliveryHours = average(technicalDeliveries.map((delivery) => hoursBetween(salesById.get(delivery.saleId)?.closedAt, delivery.scheduledAt)));
  const now = Date.now();
  const overduePendingProcesses = sales
    .filter((sale) => {
      if (!sale.closedAt) return false;
      const ageHours = (now - sale.closedAt.getTime()) / 3_600_000;
      return ageHours >= 72 && (!saleHasReleasedPayment.has(sale.id) || !saleHasSignedContract.has(sale.id) || !saleHasTechnicalDelivery.has(sale.id));
    })
    .slice(0, 20)
    .map((sale) => ({
      saleId: sale.id,
      closedAt: iso(sale.closedAt),
      pending: [
        !saleHasReleasedPayment.has(sale.id) ? "payment" : null,
        !saleHasSignedContract.has(sale.id) ? "signature" : null,
        !saleHasTechnicalDelivery.has(sale.id) ? "technical_delivery" : null,
      ].filter((item): item is string => Boolean(item)),
    }));
  const bottlenecks = [
    { key: "awaiting_payment", label: "Aguardando pagamento/liberacao financeira", count: awaitingPayment.size },
    { key: "awaiting_signature", label: "Aguardando assinatura", count: awaitingSignature },
    { key: "awaiting_inspection", label: "Aguardando laudo", count: awaitingInspection.size },
    { key: "awaiting_dispatch", label: "Aguardando despachante", count: awaitingDispatch.size },
    { key: "documents_ready_awaiting_buyer_notice", label: "Documento pronto sem aviso ao comprador", count: documentsReadyAwaitingBuyerNotice.length },
  ].sort((left, right) => right.count - left.count);

  return {
    totals: {
      administrativeSales: sales.length,
      openDossiers: dossiers.filter((dossier) => dossier.status === "OPEN").length,
      checklistItems: checklist.length,
    },
    queues: {
      awaitingPayment: awaitingPayment.size,
      awaitingSignature,
      awaitingInspection: awaitingInspection.size,
      awaitingDispatch: awaitingDispatch.size,
      documentsReadyAwaitingBuyerNotice: documentsReadyAwaitingBuyerNotice.length,
    },
    averages: {
      documentCompletionHours,
      technicalDeliveryHours,
    },
    additionalRevenue: {
      totalRevenue: money(revenueTotal),
      totalCost: money(costTotal),
      totalSpread: money(revenueTotal - costTotal),
    },
    bottlenecks,
    overduePendingProcesses,
  };
}

export async function registerSaleDossierRoutes(app: FastifyInstance) {
  app.get("/metrics/summary", async (request) => {
    const session = await requirePermission(request, { module: "sales", action: "read", scope: "STORE", sensitiveArea: "general" });
    if (!isCommercialFullView(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Apenas Gestao/Administracao visualiza metricas de dossies.");
    }
    return { data: await buildDashboardSummary(session.user.storeId) };
  });

  app.get("/:saleId", async (request) => {
    const session = await requirePermission(request, { module: "sales", action: "read", scope: "STORE", sensitiveArea: "general" });
    const params = saleDossierParamsSchema.parse(request.params);
    const sale = await loadDossierSale(session, params.saleId);
    const result = await rebuildDossier(session.user.storeId, sale, session.user.id);
    return {
      data: {
        dossier: serializeDossier(result.dossier),
        metrics: result.metrics,
        documents: result.documents.map(serializeDocument),
        recentEvents: result.recentEvents.map(serializeEvent),
      },
    };
  });

  app.get("/:saleId/documents", async (request) => {
    const session = await requirePermission(request, { module: "sales", action: "read", scope: "STORE", sensitiveArea: "general" });
    const params = saleDossierParamsSchema.parse(request.params);
    const query = dossierDocumentsQuerySchema.parse(request.query);
    const sale = await loadDossierSale(session, params.saleId);
    const { dossier } = await rebuildDossier(session.user.storeId, sale, session.user.id);
    const pagination = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      saleDossierId: dossier.id,
      ...(query.document_type ? { documentType: query.document_type } : {}),
      ...(query.source_module ? { sourceModule: query.source_module } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.saleDossierDocument.findMany({ where, orderBy: { capturedAt: "desc" }, skip: pagination.skip, take: pagination.take }),
      prisma.saleDossierDocument.count({ where }),
    ]);
    return listResponse(items.map(serializeDocument), query, total);
  });

  app.post("/:saleId/documents", async (request, reply) => {
    const session = await requirePermission(request, { module: "sales", action: "update", scope: "STORE", sensitiveArea: "general" });
    if (!isCommercialFullView(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Apenas Gestao/Administracao anexa documentos ao dossie.");
    }
    const params = saleDossierParamsSchema.parse(request.params);
    const input = attachDossierDocumentSchema.parse(request.body ?? {});
    const sale = await loadDossierSale(session, params.saleId);
    const attachment = await prisma.fileAttachment.findFirst({
      where: {
        id: input.attachmentId,
        deletedAt: null,
        status: { in: ["ACTIVE", "RETAINED"] },
        OR: [{ storeId: session.user.storeId }, { storeId: null }],
      },
    });
    if (!attachment) {
      throw new ApiError("NOT_FOUND", "Arquivo do dossie nao encontrado.");
    }
    const { dossier } = await rebuildDossier(session.user.storeId, sale, session.user.id);
    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.saleDossierDocument.upsert({
        where: { saleDossierId_attachmentId_documentType: { saleDossierId: dossier.id, attachmentId: attachment.id, documentType: input.documentType } },
        update: {
          sourceModule: input.sourceModule,
          sourceEntityType: input.sourceEntityType ?? "sale",
          sourceEntityId: input.sourceEntityId ?? sale.id,
          origin: "MANUAL",
          responsibleUserId: input.responsibleUserId === undefined ? session.user.id : input.responsibleUserId,
          metadata: input.metadata === undefined ? undefined : (input.metadata as Prisma.InputJsonObject),
        },
        create: {
          storeId: session.user.storeId,
          saleDossierId: dossier.id,
          saleId: sale.id,
          vehicleId: sale.vehicleId,
          buyerId: sale.customerId,
          attachmentId: attachment.id,
          documentType: input.documentType,
          sourceModule: input.sourceModule,
          sourceEntityType: input.sourceEntityType ?? "sale",
          sourceEntityId: input.sourceEntityId ?? sale.id,
          origin: "MANUAL",
          responsibleUserId: input.responsibleUserId === undefined ? session.user.id : input.responsibleUserId,
          metadata: input.metadata === undefined ? undefined : (input.metadata as Prisma.InputJsonObject),
        },
      });
      await tx.saleDossierEvent.create({
        data: {
          storeId: session.user.storeId,
          saleDossierId: dossier.id,
          saleId: sale.id,
          eventType: "dossier_document_attached",
          sourceModule: "sale_dossiers",
          sourceEntityType: "sale_dossier_document",
          sourceEntityId: created.id,
          actorUserId: session.user.id,
          occurredAt: new Date(),
          toStatus: "ATTACHED",
          payload: { attachmentId: attachment.id, documentType: input.documentType },
        },
      });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "sale_dossiers",
          action: "sale_dossier_document_attached",
          entityType: "sale_dossier",
          entityId: dossier.id,
          result: "SUCCESS",
          metadata: { saleId: sale.id, attachmentId: attachment.id, documentType: input.documentType },
        },
      });
      return created;
    });
    return reply.code(201).send({ data: serializeDocument(document) });
  });

  app.get("/:saleId/events", async (request) => {
    const session = await requirePermission(request, { module: "sales", action: "read", scope: "STORE", sensitiveArea: "general" });
    const params = saleDossierParamsSchema.parse(request.params);
    const query = dossierEventsQuerySchema.parse(request.query);
    const sale = await loadDossierSale(session, params.saleId);
    const { dossier } = await rebuildDossier(session.user.storeId, sale, session.user.id);
    const pagination = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      saleDossierId: dossier.id,
      ...(query.event_type ? { eventType: query.event_type } : {}),
      ...(query.source_module ? { sourceModule: query.source_module } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.saleDossierEvent.findMany({ where, orderBy: { occurredAt: "desc" }, skip: pagination.skip, take: pagination.take }),
      prisma.saleDossierEvent.count({ where }),
    ]);
    return listResponse(items.map(serializeEvent), query, total);
  });
}
