import type { FastifyInstance } from "fastify";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { PAYMENT_RELEASED_STATUS } from "../services/sale-payment-check.js";
import { requiredSaleInspectionReportBlockers } from "../services/sale-inspection-report.js";

const dispatchStatuses = [
  "OPEN",
  "AWAITING_DOCUMENTS",
  "READY_TO_SEND",
  "SENT_TO_DISPATCHER",
  "PRINTED",
  "SEPARATED_FOR_PHYSICAL_DELIVERY",
  "DELIVERED_TO_DISPATCHER",
  "PROTOCOL_RECEIVED",
  "IN_PROGRESS_AT_DISPATCHER",
  "PENDING_CORRECTION",
  "COMPLETED",
  "CANCELLED",
] as const;
const dispatchStatusSchema = z.enum(dispatchStatuses);
const transferModeSchema = z.enum(["PROCURATION", "ATPVE_RECEIPT", "GREEN_RECEIPT_PHYSICAL"] as const);
const dispatchChannelSchema = z.enum(["EMAIL", "WHATSAPP", "MANUAL_PHYSICAL"] as const);
const packageStatuses = ["AWAITING_DOCUMENTS", "READY_TO_SEND", "SENT", "PREPARED_FOR_WHATSAPP", "PRINTED", "DELIVERED_TO_DISPATCHER"] as const;
const requiredBuyerDocumentKeys = ["buyer_document_checked"];
const requiredChecklistDocuments = [
  { itemKey: "person_identity_document", key: "buyer_identity_document", label: "Copia do documento do comprador" },
  { itemKey: "person_address_proof", key: "buyer_address_proof", label: "Comprovante de residencia do comprador" },
] as const;

type DispatchStatus = (typeof dispatchStatuses)[number];
type DispatchChannel = z.infer<typeof dispatchChannelSchema>;
type TransferMode = z.infer<typeof transferModeSchema>;
type DispatchRecord = Prisma.DispatcherProcessGetPayload<Record<string, never>>;
type ProviderRecord = Pick<
  Prisma.ServiceProviderGetPayload<Record<string, never>>,
  "id" | "name" | "serviceTypes" | "contactName" | "phone" | "email" | "preferredDispatchChannel"
>;
type SaleForDispatch = {
  id: string;
  customerId: string | null;
  vehicleId: string | null;
  sellerUserId: string | null;
  status: string;
};

type DispatchPackageDocument = {
  key: string;
  label: string;
  attachmentId: string | null;
  source: string;
  sourceId: string | null;
  required: boolean;
};

type DispatchMissingDocument = {
  key: string;
  label: string;
  reason: string;
};

type DispatchPackageReview = {
  ready: boolean;
  transferMode: TransferMode | null;
  packageStatus: (typeof packageStatuses)[number];
  documentPackageId: string | null;
  documentsIncluded: DispatchPackageDocument[];
  missingDocuments: DispatchMissingDocument[];
  physicalDeliveryRequired: boolean;
};

const dispatchQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status: dispatchStatusSchema.optional(),
  package_status: z.enum(packageStatuses).optional(),
  sale_id: z.string().uuid().optional(),
  provider_id: z.string().uuid().optional(),
});

const dispatchPayloadSchema = z.object({
  saleId: z.string().uuid(),
  providerId: z.string().uuid().optional(),
  status: dispatchStatusSchema.default("AWAITING_DOCUMENTS"),
  channel: z.string().trim().max(80).optional(),
  transferMode: transferModeSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

const dispatchParamsSchema = z.object({ id: z.string().uuid() });
const dispatchSaleParamsSchema = z.object({ saleId: z.string().uuid() });

const updateDispatchSchema = z
  .object({
    providerId: z.string().uuid().nullable().optional(),
    status: dispatchStatusSchema.optional(),
    channel: z.string().trim().max(80).nullable().optional(),
    transferMode: transferModeSchema.nullable().optional(),
    metadata: z.record(z.unknown()).nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });

const statusUpdateSchema = z.object({
  status: dispatchStatusSchema,
  reason: z.string().trim().max(300).optional(),
  protocolNumber: z.string().trim().max(80).optional(),
  protocolFileId: z.string().uuid().optional(),
  statusNotes: z.string().trim().max(1000).optional(),
  deliveredAt: z.coerce.date().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const sendPackageSchema = z.object({
  channel: dispatchChannelSchema.optional(),
  notes: z.string().trim().max(1000).optional(),
});

const printPackageSchema = z
  .object({
    printerConfigured: z.coerce.boolean().default(false),
    notes: z.string().trim().max(1000).optional(),
  })
  .default({ printerConfigured: false });

const deliverPackageSchema = z.object({
  deliveredAt: z.coerce.date().optional(),
  protocolNumber: z.string().trim().max(80).optional(),
  protocolFileId: z.string().uuid().optional(),
  notes: z.string().trim().max(1000).optional(),
});

function plainMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function sanitizeProvider(provider: ProviderRecord | null) {
  if (!provider) return null;
  return {
    id: provider.id,
    name: provider.name,
    contactName: provider.contactName,
    phone: provider.phone,
    email: provider.email,
    serviceTypes: provider.serviceTypes,
    preferredDispatchChannel: provider.preferredDispatchChannel,
  };
}

function sanitizeDispatch(process: DispatchRecord, provider: ProviderRecord | null = null) {
  return {
    id: process.id,
    saleId: process.saleId,
    vehicleId: process.vehicleId,
    customerId: process.customerId,
    sellerUserId: process.sellerUserId,
    providerId: process.providerId,
    provider: sanitizeProvider(provider),
    status: process.status,
    channel: process.channel,
    dispatcherPreferredChannel: process.dispatcherPreferredChannel,
    transferMode: process.transferMode,
    documentPackageId: process.documentPackageId,
    packageStatus: process.packageStatus,
    documentsIncluded: process.documentsIncluded,
    missingDocuments: process.missingDocuments,
    sentChannel: process.sentChannel,
    sentTo: process.sentTo,
    sentAt: process.sentAt?.toISOString() ?? null,
    sentByUserId: process.sentByUserId,
    printedAt: process.printedAt?.toISOString() ?? null,
    printedByUserId: process.printedByUserId,
    deliveredToDispatcherAt: process.deliveredToDispatcherAt?.toISOString() ?? null,
    protocolNumber: process.protocolNumber,
    protocolFileId: process.protocolFileId,
    statusNotes: process.statusNotes,
    metadata: process.metadata,
    createdAt: process.createdAt.toISOString(),
    updatedAt: process.updatedAt.toISOString(),
  };
}

async function ensureSale(storeId: string, saleId: string) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, storeId, deletedAt: null },
    select: { id: true, customerId: true, vehicleId: true, sellerUserId: true, status: true },
  });

  if (!sale) {
    throw new ApiError("NOT_FOUND", "Venda do processo de despachante nao encontrada.");
  }

  return sale;
}

async function ensureProvider(storeId: string, providerId?: string | null) {
  if (!providerId) return null;

  const provider = await prisma.serviceProvider.findFirst({
    where: { id: providerId, storeId, deletedAt: null, status: "ACTIVE" },
    select: { id: true, name: true, serviceTypes: true, contactName: true, phone: true, email: true, preferredDispatchChannel: true },
  });

  if (!provider) {
    throw new ApiError("NOT_FOUND", "Prestador/despachante nao encontrado.");
  }

  return provider;
}

async function ensureAttachmentInStore(storeId: string, attachmentId?: string | null) {
  if (!attachmentId) return null;
  const attachment = await prisma.fileAttachment.findFirst({
    where: { id: attachmentId, storeId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!attachment) {
    throw new ApiError("NOT_FOUND", "Arquivo informado nao encontrado.");
  }
  return attachment;
}

async function getDispatchOrThrow(storeId: string, id: string) {
  const process = await prisma.dispatcherProcess.findFirst({ where: { id, storeId } });
  if (!process) throw new ApiError("NOT_FOUND", "Processo de despachante nao encontrado.");
  return process;
}

async function findLinkedAttachmentId(input: { storeId: string; entityType: string; entityId: string; purposes: string[] }) {
  const link = await prisma.fileAttachmentLink.findFirst({
    where: {
      storeId: input.storeId,
      entityType: input.entityType,
      entityId: input.entityId,
      purpose: { in: input.purposes },
    },
    select: { attachmentId: true },
    orderBy: { createdAt: "desc" },
  });

  if (!link) return null;

  const attachment = await prisma.fileAttachment.findFirst({
    where: { id: link.attachmentId, storeId: input.storeId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  return attachment?.id ?? null;
}

function addMissing(missing: DispatchMissingDocument[], key: string, label: string, reason: string) {
  missing.push({ key, label, reason });
}

function addDocument(
  documents: DispatchPackageDocument[],
  input: { key: string; label: string; attachmentId: string | null; source: string; sourceId: string | null; required?: boolean },
) {
  documents.push({ ...input, required: input.required ?? true });
}

async function buildDispatchPackageReview(storeId: string, sale: SaleForDispatch, transferMode: TransferMode | null): Promise<DispatchPackageReview> {
  const [checklist, latestPackage, signedContract, inspectionReports, paymentChecks, paidIncome] = await Promise.all([
    prisma.saleDocumentChecklist.findMany({
      where: { storeId, saleId: sale.id },
      select: { id: true, itemKey: true, label: true, isDone: true, attachmentId: true, isRequired: true },
    }),
    prisma.contractDocumentPackage.findFirst({
      where: { storeId, saleId: sale.id },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.contract.findFirst({
      where: { storeId, saleId: sale.id, status: "SIGNED", signedAt: { not: null } },
      select: { id: true, signedAt: true },
      orderBy: { signedAt: "desc" },
    }),
    prisma.saleInspectionReport.findMany({
      where: { storeId, saleId: sale.id, isRequired: true },
      select: { id: true, reportType: true, status: true, isRequired: true, reportFileId: true },
    }),
    prisma.salePaymentCheck.findMany({
      where: { storeId, saleId: sale.id, isRequired: true },
      select: { id: true, paymentItemType: true, releaseStatus: true },
    }),
    prisma.financialTransaction.findFirst({
      where: { storeId, entityType: "sale", entityId: sale.id, type: "INCOME", status: "PAID", deletedAt: null },
      select: { id: true, paidAt: true },
      orderBy: { paidAt: "desc" },
    }),
  ]);

  const documents: DispatchPackageDocument[] = [];
  const missing: DispatchMissingDocument[] = [];
  const checklistByKey = new Map(checklist.map((item) => [item.itemKey, item]));

  if (!transferMode) {
    addMissing(missing, "transfer_mode", "Modalidade de transferencia", "transfer_mode_missing");
  }

  if (!sale.customerId) addMissing(missing, "buyer", "Comprador vinculado a venda", "sale_link_missing");
  if (!sale.vehicleId) addMissing(missing, "vehicle", "Veiculo vinculado a venda", "sale_link_missing");
  if (!sale.sellerUserId) addMissing(missing, "seller", "Vendedor vinculado a venda", "sale_link_missing");

  for (const key of requiredBuyerDocumentKeys) {
    const item = checklistByKey.get(key);
    if (!item?.isDone) {
      addMissing(missing, key, item?.label ?? "Documentos do comprador conferidos", "buyer_documents_not_checked");
    }
  }

  for (const required of requiredChecklistDocuments) {
    const item = checklistByKey.get(required.itemKey);
    if (item?.isDone && item.attachmentId) {
      addDocument(documents, {
        key: required.key,
        label: required.label,
        attachmentId: item.attachmentId,
        source: "sale_document_checklist",
        sourceId: item.id,
      });
    } else {
      addMissing(missing, required.key, required.label, item?.isDone ? "attachment_missing" : "required_document_pending");
    }
  }

  const linkedSignedContractFileId = signedContract
    ? await findLinkedAttachmentId({ storeId, entityType: "contract", entityId: signedContract.id, purposes: ["signed_contract", "contract_package_signed_document"] })
    : null;
  const signedContractFileId = latestPackage?.signedFileId ?? linkedSignedContractFileId;
  if (latestPackage?.status === "SIGNED_ALL" || signedContract) {
    addDocument(documents, {
      key: "signed_contract",
      label: "Contrato/recibo de compra e venda assinado",
      attachmentId: signedContractFileId ?? null,
      source: latestPackage?.signedFileId ? "contract_document_package" : "contract_record",
      sourceId: latestPackage?.id ?? signedContract?.id ?? null,
    });
  } else {
    addMissing(missing, "signed_contract", "Contrato/recibo de compra e venda assinado", "contract_not_signed");
  }

  const atpveApplicable = transferMode === "ATPVE_RECEIPT" || latestPackage?.vehicleTransferMode === "CDT_DIGITAL" || latestPackage?.vehicleTransferMode === "E_NOTARIADO";
  if (atpveApplicable) {
    const atpveFileId = latestPackage?.atpveEvidenceFileId ?? latestPackage?.atpveFileId ?? null;
    if (latestPackage?.atpveStatus === "COMPLETED" && atpveFileId) {
      addDocument(documents, {
        key: "signed_atpve",
        label: "ATPV-e assinada/evidencia de transferencia",
        attachmentId: atpveFileId,
        source: "contract_document_package",
        sourceId: latestPackage.id,
      });
    } else {
      addMissing(missing, "signed_atpve", "ATPV-e assinada quando aplicavel", "atpve_not_completed");
    }
  }

  const inspectionBlockers = requiredSaleInspectionReportBlockers(inspectionReports);
  for (const blocker of inspectionBlockers) {
    addMissing(missing, `inspection_report_${blocker.reportType.toLowerCase()}`, `Laudo ${blocker.reportType}`, blocker.reason);
  }
  for (const report of inspectionReports) {
    if ((report.status === "CHECKED" || report.status === "WAIVED") && report.reportFileId) {
      addDocument(documents, {
        key: report.reportType === "CAUTIONARY" ? "cautionary_report" : "transfer_report",
        label: report.reportType === "CAUTIONARY" ? "Laudo cautelar" : "Laudo de transferencia",
        attachmentId: report.reportFileId,
        source: "sale_inspection_report",
        sourceId: report.id,
      });
    }
  }

  const paymentReady = paymentChecks.length > 0 ? paymentChecks.every((item) => item.releaseStatus === PAYMENT_RELEASED_STATUS) : Boolean(paidIncome);
  if (!paymentReady) {
    addMissing(missing, "payment_release", "Pagamento liberado para documentacao", "payment_not_released");
  }

  const ready = missing.length === 0;
  return {
    ready,
    transferMode,
    packageStatus: ready ? "READY_TO_SEND" : "AWAITING_DOCUMENTS",
    documentPackageId: latestPackage?.id ?? null,
    documentsIncluded: documents,
    missingDocuments: missing,
    physicalDeliveryRequired: transferMode === "GREEN_RECEIPT_PHYSICAL",
  };
}

function resolvePreferredChannel(provider: ProviderRecord | null, transferMode: TransferMode | null): DispatchChannel | null {
  if (provider?.preferredDispatchChannel === "EMAIL" || provider?.preferredDispatchChannel === "WHATSAPP" || provider?.preferredDispatchChannel === "MANUAL_PHYSICAL") {
    return provider.preferredDispatchChannel;
  }
  return transferMode === "GREEN_RECEIPT_PHYSICAL" ? "MANUAL_PHYSICAL" : null;
}

function resolveRecipient(provider: ProviderRecord, channel: DispatchChannel) {
  if (channel === "EMAIL") return provider.email;
  if (channel === "WHATSAPP") return provider.phone;
  return provider.name;
}

function assertCompletePackage(review: DispatchPackageReview) {
  if (!review.ready) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Pacote documental do despachante incompleto.", {
      missingDocuments: review.missingDocuments,
      packageStatus: review.packageStatus,
    });
  }
}

export async function registerDispatchRoutes(app: FastifyInstance) {
  app.get("/processes", async (request) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const query = dispatchQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where: Prisma.DispatcherProcessWhereInput = {
      storeId: session.user.storeId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.package_status ? { packageStatus: query.package_status } : {}),
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
      ...(query.provider_id ? { providerId: query.provider_id } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.dispatcherProcess.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.dispatcherProcess.count({ where }),
    ]);

    return listResponse(items.map((item) => sanitizeDispatch(item)), query, total);
  });

  app.get("/processes/by-sale/:saleId", async (request) => {
    const session = await requirePermission(request, { module: "sales", action: "read", scope: "STORE", sensitiveArea: "general" });
    const params = dispatchSaleParamsSchema.parse(request.params);
    const sale = await ensureSale(session.user.storeId, params.saleId);
    if ((session.user.role === "SELLER" || session.user.role === "SDR") && sale.sellerUserId !== session.user.id) {
      throw new ApiError("NOT_FOUND", "Processo de despachante nao encontrado.");
    }

    const process = await prisma.dispatcherProcess.findFirst({ where: { storeId: session.user.storeId, saleId: sale.id }, orderBy: { updatedAt: "desc" } });
    if (!process) {
      throw new ApiError("NOT_FOUND", "Processo de despachante nao encontrado.");
    }
    return { data: sanitizeDispatch(process) };
  });

  app.get("/processes/:id", async (request) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = dispatchParamsSchema.parse(request.params);
    const process = await getDispatchOrThrow(session.user.storeId, params.id);
    const provider = await ensureProvider(session.user.storeId, process.providerId);
    return { data: sanitizeDispatch(process, provider) };
  });

  app.get("/processes/:id/package", async (request) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = dispatchParamsSchema.parse(request.params);
    const process = await getDispatchOrThrow(session.user.storeId, params.id);
    const sale = await ensureSale(session.user.storeId, process.saleId);
    const provider = await ensureProvider(session.user.storeId, process.providerId);
    const transferMode = (process.transferMode as TransferMode | null) ?? null;
    const review = await buildDispatchPackageReview(session.user.storeId, sale, transferMode);

    return {
      data: sanitizeDispatch(process, provider),
      package: {
        ...review,
        dispatcher: sanitizeProvider(provider),
        preferredChannel: resolvePreferredChannel(provider, transferMode),
      },
    };
  });

  app.post("/processes", async (request, reply) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const input = dispatchPayloadSchema.parse(request.body);
    const sale = await ensureSale(session.user.storeId, input.saleId);
    const provider = await ensureProvider(session.user.storeId, input.providerId);
    const transferMode = input.transferMode ?? null;
    const review = await buildDispatchPackageReview(session.user.storeId, sale, transferMode);

    const process = await prisma.$transaction(async (tx) => {
      const created = await tx.dispatcherProcess.create({
        data: {
          storeId: session.user.storeId,
          saleId: sale.id,
          vehicleId: sale.vehicleId,
          customerId: sale.customerId,
          sellerUserId: sale.sellerUserId,
          providerId: input.providerId,
          status: input.status,
          channel: input.channel,
          dispatcherPreferredChannel: provider?.preferredDispatchChannel ?? null,
          transferMode,
          documentPackageId: review.documentPackageId,
          packageStatus: review.packageStatus,
          documentsIncluded: review.documentsIncluded as unknown as Prisma.InputJsonValue,
          missingDocuments: review.missingDocuments as unknown as Prisma.InputJsonValue,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "dispatch",
          action: "dispatcher_process_created",
          entityType: "dispatcher_process",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            saleId: created.saleId,
            providerId: created.providerId,
            status: created.status,
            transferMode: created.transferMode,
            packageStatus: created.packageStatus,
            missingDocuments: review.missingDocuments,
          },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "dispatch.process_created",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "dispatcher_process",
      entityId: process.id,
      payload: { saleId: process.saleId, providerId: process.providerId, status: process.status, transferMode: process.transferMode },
    });

    return reply.code(201).send({ data: sanitizeDispatch(process, provider), package: review });
  });

  app.patch("/processes/:id", async (request) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = dispatchParamsSchema.parse(request.params);
    const input = updateDispatchSchema.parse(request.body);
    const current = await getDispatchOrThrow(session.user.storeId, params.id);
    const sale = await ensureSale(session.user.storeId, current.saleId);
    const providerId = input.providerId === undefined ? current.providerId : input.providerId;
    const provider = await ensureProvider(session.user.storeId, providerId);
    const transferMode = input.transferMode === undefined ? (current.transferMode as TransferMode | null) : input.transferMode;
    const review = await buildDispatchPackageReview(session.user.storeId, sale, transferMode);

    const process = await prisma.$transaction(async (tx) => {
      const updated = await tx.dispatcherProcess.update({
        where: { id: current.id },
        data: {
          providerId,
          status: input.status,
          channel: input.channel,
          dispatcherPreferredChannel: provider?.preferredDispatchChannel ?? null,
          transferMode,
          documentPackageId: review.documentPackageId,
          packageStatus: review.packageStatus,
          documentsIncluded: review.documentsIncluded as unknown as Prisma.InputJsonValue,
          missingDocuments: review.missingDocuments as unknown as Prisma.InputJsonValue,
          metadata: input.metadata === undefined ? undefined : input.metadata === null ? Prisma.JsonNull : (input.metadata as Prisma.InputJsonObject),
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "dispatch",
          action: "dispatcher_process_updated",
          entityType: "dispatcher_process",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            changedFields: Object.keys(input),
            fromStatus: current.status,
            toStatus: updated.status,
            packageStatus: updated.packageStatus,
            missingDocuments: review.missingDocuments,
          },
        },
      });

      return updated;
    });

    if (input.status && input.status !== current.status) {
      await emitInternalEvent({
        name: "dispatch.process_status_changed",
        storeId: session.user.storeId,
        actorId: session.user.id,
        entityType: "dispatcher_process",
        entityId: process.id,
        payload: { fromStatus: current.status, toStatus: process.status },
      });
    }

    return { data: sanitizeDispatch(process, provider), package: review };
  });

  app.post("/processes/:id/send-package", async (request) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = dispatchParamsSchema.parse(request.params);
    const input = sendPackageSchema.parse(request.body ?? {});
    const current = await getDispatchOrThrow(session.user.storeId, params.id);
    const sale = await ensureSale(session.user.storeId, current.saleId);
    const provider = await ensureProvider(session.user.storeId, current.providerId);
    if (!provider) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Selecione um despachante antes de enviar o pacote.", { missing: ["dispatcher_id"] });
    }
    const transferMode = (current.transferMode as TransferMode | null) ?? null;
    const review = await buildDispatchPackageReview(session.user.storeId, sale, transferMode);
    assertCompletePackage(review);

    const channel = input.channel ?? resolvePreferredChannel(provider, transferMode);
    if (!channel) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Despachante sem canal preferencial configurado.", { missing: ["dispatcher_preferred_channel"] });
    }
    const recipient = resolveRecipient(provider, channel);
    if (!recipient) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Canal do despachante sem destinatario configurado.", { missing: [channel === "EMAIL" ? "dispatcher_email" : "dispatcher_phone"] });
    }

    const now = new Date();
    const packageStatus = channel === "WHATSAPP" ? "PREPARED_FOR_WHATSAPP" : "SENT";
    const status: DispatchStatus = "SENT_TO_DISPATCHER";
    const process = await prisma.$transaction(async (tx) => {
      const updated = await tx.dispatcherProcess.update({
        where: { id: current.id },
        data: {
          status,
          packageStatus,
          sentChannel: channel,
          sentTo: recipient,
          sentAt: now,
          sentByUserId: session.user.id,
          documentPackageId: review.documentPackageId,
          documentsIncluded: review.documentsIncluded as unknown as Prisma.InputJsonValue,
          missingDocuments: review.missingDocuments as unknown as Prisma.InputJsonValue,
          statusNotes: input.notes,
          metadata: {
            ...plainMetadata(current.metadata),
            lastDispatchAction: "send_package",
            physicalDeliveryRequired: review.physicalDeliveryRequired,
          } as Prisma.InputJsonObject,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "dispatch",
          action: "dispatcher_package_sent",
          entityType: "dispatcher_process",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            saleId: updated.saleId,
            providerId: updated.providerId,
            transferMode: updated.transferMode,
            channel,
            recipient,
            documentsIncluded: review.documentsIncluded,
            physicalDeliveryRequired: review.physicalDeliveryRequired,
          },
        },
      });

      return updated;
    });

    await emitInternalEvent({
      name: "dispatch.package_sent",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "dispatcher_process",
      entityId: process.id,
      payload: { saleId: process.saleId, providerId: process.providerId, channel, physicalDeliveryRequired: review.physicalDeliveryRequired },
    });

    return {
      data: sanitizeDispatch(process, provider),
      package: review,
      delivery: {
        channel,
        recipient,
        mode: channel === "WHATSAPP" ? "manual_whatsapp_prepared" : channel === "EMAIL" ? "email_prepared" : "manual_physical",
        sentAt: now.toISOString(),
        physicalDeliveryRequired: review.physicalDeliveryRequired,
      },
    };
  });

  app.post("/processes/:id/print-package", async (request) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = dispatchParamsSchema.parse(request.params);
    const input = printPackageSchema.parse(request.body ?? {});
    const current = await getDispatchOrThrow(session.user.storeId, params.id);
    const sale = await ensureSale(session.user.storeId, current.saleId);
    const provider = await ensureProvider(session.user.storeId, current.providerId);
    const transferMode = (current.transferMode as TransferMode | null) ?? null;
    const review = await buildDispatchPackageReview(session.user.storeId, sale, transferMode);
    assertCompletePackage(review);

    const now = new Date();
    const process = await prisma.$transaction(async (tx) => {
      const updated = await tx.dispatcherProcess.update({
        where: { id: current.id },
        data: {
          status: "PRINTED",
          packageStatus: "PRINTED",
          printedAt: now,
          printedByUserId: session.user.id,
          documentPackageId: review.documentPackageId,
          documentsIncluded: review.documentsIncluded as unknown as Prisma.InputJsonValue,
          missingDocuments: review.missingDocuments as unknown as Prisma.InputJsonValue,
          statusNotes: input.notes,
          metadata: {
            ...plainMetadata(current.metadata),
            lastDispatchAction: "print_package",
            printerConfigured: input.printerConfigured,
            physicalDeliveryRequired: review.physicalDeliveryRequired,
          } as Prisma.InputJsonObject,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "dispatch",
          action: "dispatcher_package_printed",
          entityType: "dispatcher_process",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            saleId: updated.saleId,
            providerId: updated.providerId,
            transferMode: updated.transferMode,
            printerConfigured: input.printerConfigured,
            documentsIncluded: review.documentsIncluded,
          },
        },
      });

      return updated;
    });

    return {
      data: sanitizeDispatch(process, provider),
      package: review,
      print: {
        mode: input.printerConfigured ? "printer" : "manual_pdf",
        printedAt: now.toISOString(),
        documents: review.documentsIncluded,
      },
    };
  });

  app.post("/processes/:id/deliver", async (request) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = dispatchParamsSchema.parse(request.params);
    const input = deliverPackageSchema.parse(request.body ?? {});
    const current = await getDispatchOrThrow(session.user.storeId, params.id);
    const provider = await ensureProvider(session.user.storeId, current.providerId);
    await ensureAttachmentInStore(session.user.storeId, input.protocolFileId);

    const deliveredAt = input.deliveredAt ?? new Date();
    const nextStatus: DispatchStatus = input.protocolNumber || input.protocolFileId ? "PROTOCOL_RECEIVED" : "DELIVERED_TO_DISPATCHER";
    const process = await prisma.$transaction(async (tx) => {
      const updated = await tx.dispatcherProcess.update({
        where: { id: current.id },
        data: {
          status: nextStatus,
          packageStatus: "DELIVERED_TO_DISPATCHER",
          deliveredToDispatcherAt: deliveredAt,
          protocolNumber: input.protocolNumber,
          protocolFileId: input.protocolFileId,
          statusNotes: input.notes,
          metadata: {
            ...plainMetadata(current.metadata),
            lastDispatchAction: "deliver_to_dispatcher",
          } as Prisma.InputJsonObject,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "dispatch",
          action: "dispatcher_package_delivered",
          entityType: "dispatcher_process",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            saleId: updated.saleId,
            providerId: updated.providerId,
            deliveredAt: deliveredAt.toISOString(),
            protocolNumber: input.protocolNumber ?? null,
            protocolFileId: input.protocolFileId ?? null,
          },
        },
      });

      return updated;
    });

    return { data: sanitizeDispatch(process, provider) };
  });

  app.post("/processes/:id/status", async (request) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = dispatchParamsSchema.parse(request.params);
    const input = statusUpdateSchema.parse(request.body);
    const current = await getDispatchOrThrow(session.user.storeId, params.id);
    await ensureAttachmentInStore(session.user.storeId, input.protocolFileId);

    const process = await prisma.$transaction(async (tx) => {
      const updated = await tx.dispatcherProcess.update({
        where: { id: current.id },
        data: {
          status: input.status,
          deliveredToDispatcherAt: input.deliveredAt === undefined ? undefined : input.deliveredAt,
          protocolNumber: input.protocolNumber === undefined ? undefined : input.protocolNumber,
          protocolFileId: input.protocolFileId === undefined ? undefined : input.protocolFileId,
          statusNotes: input.statusNotes === undefined ? input.reason : input.statusNotes,
          metadata: input.metadata ? ({ ...plainMetadata(current.metadata), ...input.metadata } as Prisma.InputJsonObject) : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "dispatch",
          action: "dispatcher_process_status_changed",
          entityType: "dispatcher_process",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { fromStatus: current.status, toStatus: updated.status, reason: input.reason, protocolNumber: input.protocolNumber ?? null },
        },
      });

      return updated;
    });

    await emitInternalEvent({
      name: "dispatch.process_status_changed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "dispatcher_process",
      entityId: process.id,
      payload: { fromStatus: current.status, toStatus: process.status, reason: input.reason },
    });

    return { data: sanitizeDispatch(process) };
  });
}
