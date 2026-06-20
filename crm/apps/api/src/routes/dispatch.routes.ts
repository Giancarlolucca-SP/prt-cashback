import type { FastifyInstance } from "fastify";
import { Prisma, type UserRole } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { activeStoreUserIdsByRoles, notifyActiveUsers } from "../services/internal-notifications.js";
import { prisma } from "../lib/db.js";
import { PAYMENT_RELEASED_STATUS } from "../services/sale-payment-check.js";
import { containsRemoteLoadVector, rejectRemoteLoadVectorsMessage } from "../security/remote-content.js";
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
type DispatchDocumentReadyRecord = Prisma.DispatchDocumentReadyGetPayload<Record<string, never>>;
type BuyerDocumentReadyNotificationRecord = Prisma.BuyerDocumentReadyNotificationGetPayload<Record<string, never>>;
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
const documentReadySourceChannelSchema = z.enum(["EMAIL", "WHATSAPP", "MANUAL"] as const);
const documentReadyLinkConfidenceSchema = z.enum(["AUTOMATIC", "MANUAL", "REVIEWED"] as const);
const documentReadyStatusSchema = z.enum(["RECEIVED", "RECONCILIATION", "LINKED", "REJECTED"] as const);
const buyerDocumentReadyChannelSchema = z.enum(["WHATSAPP", "EMAIL", "MANUAL"] as const);
const buyerDocumentReadyNotificationStatusSchema = z.enum(["PENDING", "SENT", "DELIVERED", "FAILED", "RESENT", "CANCELLED"] as const);
const documentReadyParamsSchema = dispatchParamsSchema.extend({ documentReadyId: z.string().uuid() });
const documentReadyNotificationParamsSchema = documentReadyParamsSchema.extend({ notificationId: z.string().uuid() });
const documentReadyAdminRoles: readonly UserRole[] = ["ADMINISTRATIVE", "OWNER_MANAGER", "ADMIN"];
const buyerDocumentReadyContactRequiredType = "buyer_document_ready_contact_required";

const safeMessageField = z
  .string()
  .trim()
  .min(10)
  .max(1000)
  .refine((value) => !containsRemoteLoadVector(value), { message: rejectRemoteLoadVectorsMessage("Mensagem ao comprador") });

const registerDocumentReadySchema = z
  .object({
    sourceChannel: documentReadySourceChannelSchema.default("MANUAL"),
    receivedAt: z.coerce.date().optional(),
    receivedFrom: z.string().trim().max(160).optional(),
    fileId: z.string().uuid().nullable().optional(),
    fileName: z.string().trim().max(180).optional(),
    documentType: z.string().trim().min(2).max(80).default("VEHICLE_DOCUMENT"),
    linkConfidence: documentReadyLinkConfidenceSchema.default("MANUAL"),
    status: documentReadyStatusSchema.default("LINKED"),
    administrativeConfirmation: z.boolean().default(false),
    markProcessCompleted: z.boolean().default(true),
    metadata: z.record(z.unknown()).optional(),
  })
  .superRefine((input, ctx) => {
    if (!input.fileId && !input.administrativeConfirmation) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe arquivo ou confirmacao administrativa do documento pronto.", path: ["fileId"] });
    }
  });

const requestBuyerDocumentReadyNotificationSchema = z.object({
  channel: buyerDocumentReadyChannelSchema.optional(),
  recipientContact: z.string().trim().max(160).optional(),
  messageTemplateId: z.string().uuid().nullable().optional(),
  messageText: safeMessageField.optional(),
  attachmentFileId: z.string().uuid().nullable().optional(),
  status: buyerDocumentReadyNotificationStatusSchema.default("PENDING"),
  sentAt: z.coerce.date().optional(),
  failureReason: z.string().trim().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateBuyerDocumentReadyNotificationSchema = z
  .object({
    status: buyerDocumentReadyNotificationStatusSchema.optional(),
    sentAt: z.coerce.date().nullable().optional(),
    failureReason: z.string().trim().max(500).nullable().optional(),
    metadata: z.record(z.unknown()).nullable().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Informe ao menos um campo para atualizar.",
  })
  .superRefine((input, ctx) => {
    if (input.status === "FAILED" && !input.failureReason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe motivo da falha.", path: ["failureReason"] });
    }
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

function sanitizeDocumentReady(document: DispatchDocumentReadyRecord, notifications: BuyerDocumentReadyNotificationRecord[] = []) {
  return {
    id: document.id,
    dispatchProcessId: document.dispatchProcessId,
    saleId: document.saleId,
    vehicleId: document.vehicleId,
    buyerId: document.buyerId,
    dispatcherId: document.dispatcherId,
    sourceChannel: document.sourceChannel,
    receivedAt: document.receivedAt.toISOString(),
    receivedFrom: document.receivedFrom,
    fileId: document.fileId,
    fileName: document.fileName,
    documentType: document.documentType,
    linkedByUserId: document.linkedByUserId,
    linkConfidence: document.linkConfidence,
    status: document.status,
    metadata: document.metadata,
    notificationAttempts: notifications.map(sanitizeBuyerDocumentReadyNotification),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

function sanitizeBuyerDocumentReadyNotification(notification: BuyerDocumentReadyNotificationRecord) {
  return {
    id: notification.id,
    documentReadyId: notification.documentReadyId,
    dispatchProcessId: notification.dispatchProcessId,
    saleId: notification.saleId,
    buyerId: notification.buyerId,
    vehicleId: notification.vehicleId,
    channel: notification.channel,
    recipientContact: notification.recipientContact,
    messageTemplateId: notification.messageTemplateId,
    messageTextSnapshot: notification.messageTextSnapshot,
    attachmentFileId: notification.attachmentFileId,
    sentAt: notification.sentAt?.toISOString() ?? null,
    sentByUserId: notification.sentByUserId,
    sentBy: notification.sentBy,
    status: notification.status,
    failureReason: notification.failureReason,
    retryCount: notification.retryCount,
    metadata: notification.metadata,
    createdAt: notification.createdAt.toISOString(),
    updatedAt: notification.updatedAt.toISOString(),
  };
}

function buyerVehicleLabel(vehicle: { brand: string; model: string; plate: string | null } | null) {
  if (!vehicle) return "veiculo";
  const base = [vehicle.brand, vehicle.model].filter(Boolean).join(" ").trim() || "veiculo";
  return vehicle.plate ? `${base} placa ${vehicle.plate}` : base;
}

function buildBuyerDocumentReadyMessage(input: { buyerName: string | null; vehicle: { brand: string; model: string; plate: string | null } | null; hasAttachment: boolean }) {
  const name = input.buyerName?.trim() || "cliente";
  const attachmentText = input.hasAttachment ? "Segue arquivo em anexo." : "Nossa equipe entrara em contato para orientar a retirada/envio.";
  return `Ola, ${name}. O documento do veiculo ${buyerVehicleLabel(input.vehicle)} ja esta pronto em seu nome. ${attachmentText} Qualquer duvida, estamos a disposicao.`;
}

function resolveBuyerDelivery(input: {
  buyer: { name: string; phone: string | null; email: string | null } | null;
  requestedChannel?: "WHATSAPP" | "EMAIL" | "MANUAL";
  recipientContact?: string;
}) {
  const override = input.recipientContact?.trim() || null;
  const phone = input.buyer?.phone?.trim() || null;
  const email = input.buyer?.email?.trim() || null;
  const requested = input.requestedChannel;

  if (requested === "MANUAL") return { channel: "MANUAL" as const, recipientContact: override ?? phone ?? email ?? input.buyer?.name ?? null };
  if (requested === "EMAIL") return email || override ? { channel: "EMAIL" as const, recipientContact: override ?? email } : { channel: "MANUAL" as const, recipientContact: phone ?? input.buyer?.name ?? null };
  if (requested === "WHATSAPP") {
    if (phone || override) return { channel: "WHATSAPP" as const, recipientContact: override ?? phone };
    if (email) return { channel: "EMAIL" as const, recipientContact: email };
    return { channel: "MANUAL" as const, recipientContact: input.buyer?.name ?? null };
  }

  if (phone) return { channel: "WHATSAPP" as const, recipientContact: phone };
  if (email) return { channel: "EMAIL" as const, recipientContact: email };
  return { channel: "MANUAL" as const, recipientContact: input.buyer?.name ?? null };
}

function buyerDeliveryMode(channel: "WHATSAPP" | "EMAIL" | "MANUAL", status: string) {
  if (["SENT", "DELIVERED", "RESENT"].includes(status)) return "manual_send_registered";
  if (channel === "WHATSAPP") return "assisted_whatsapp_prepared";
  if (channel === "EMAIL") return "assisted_email_prepared";
  return "manual_contact_required";
}

async function loadBuyerDocumentReadyContext(storeId: string, process: DispatchRecord) {
  const [buyer, vehicle] = await Promise.all([
    process.customerId
      ? prisma.customer.findFirst({ where: { id: process.customerId, storeId, deletedAt: null }, select: { id: true, name: true, phone: true, email: true } })
      : null,
    process.vehicleId
      ? prisma.vehicle.findFirst({ where: { id: process.vehicleId, storeId, deletedAt: null }, select: { id: true, brand: true, model: true, plate: true } })
      : null,
  ]);
  return { buyer, vehicle };
}

async function getDocumentReadyOrThrow(storeId: string, process: DispatchRecord, documentReadyId: string) {
  const document = await prisma.dispatchDocumentReady.findFirst({ where: { id: documentReadyId, storeId, dispatchProcessId: process.id, saleId: process.saleId } });
  if (!document) {
    throw new ApiError("NOT_FOUND", "Documento pronto nao encontrado.");
  }
  return document;
}

async function getBuyerDocumentReadyNotificationOrThrow(storeId: string, documentReadyId: string, notificationId: string) {
  const notification = await prisma.buyerDocumentReadyNotification.findFirst({ where: { id: notificationId, storeId, documentReadyId } });
  if (!notification) {
    throw new ApiError("NOT_FOUND", "Aviso ao comprador nao encontrado.");
  }
  return notification;
}

async function getDispatchForSaleRead(session: Awaited<ReturnType<typeof requirePermission>>, id: string) {
  const process = await getDispatchOrThrow(session.user.storeId, id);
  if ((session.user.role === "SELLER" || session.user.role === "SDR") && process.sellerUserId !== session.user.id) {
    throw new ApiError("NOT_FOUND", "Processo de despachante nao encontrado.");
  }
  return process;
}

async function notifyManualBuyerDocumentContactRequired(storeId: string, process: DispatchRecord, actorId: string) {
  const userIds = await activeStoreUserIdsByRoles(storeId, documentReadyAdminRoles);
  await notifyActiveUsers({
    storeId,
    userIds,
    entityType: buyerDocumentReadyContactRequiredType,
    entityId: process.id,
    title: "Contato manual necessario para documento pronto",
    body: `Venda ${process.saleId}: comprador sem canal valido para aviso automatico/assistido do documento pronto.`,
    priority: "HIGH",
    sourceModule: "dispatch",
    actionUrl: `/dispatch/processes/${process.id}`,
  });
  await prisma.auditLog.create({
    data: {
      storeId,
      actorId,
      module: "dispatch",
      action: "buyer_document_ready_contact_required",
      entityType: "dispatcher_process",
      entityId: process.id,
      result: "SUCCESS",
      metadata: { saleId: process.saleId, notificationType: buyerDocumentReadyContactRequiredType },
    },
  });
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
    select: { id: true, originalName: true },
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
    select: { id: true, originalName: true },
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

  app.get("/processes/:id/document-ready", async (request) => {
    const session = await requirePermission(request, { module: "sales", action: "read", scope: "STORE", sensitiveArea: "general" });
    const params = dispatchParamsSchema.parse(request.params);
    const process = await getDispatchForSaleRead(session, params.id);
    const [documents, notifications] = await Promise.all([
      prisma.dispatchDocumentReady.findMany({ where: { storeId: session.user.storeId, dispatchProcessId: process.id }, orderBy: { createdAt: "desc" } }),
      prisma.buyerDocumentReadyNotification.findMany({ where: { storeId: session.user.storeId, dispatchProcessId: process.id }, orderBy: { createdAt: "desc" } }),
    ]);
    const notificationsByDocument = new Map<string, BuyerDocumentReadyNotificationRecord[]>();
    for (const notification of notifications) {
      const list = notificationsByDocument.get(notification.documentReadyId) ?? [];
      list.push(notification);
      notificationsByDocument.set(notification.documentReadyId, list);
    }

    return {
      data: {
        process: sanitizeDispatch(process),
        documents: documents.map((document) => sanitizeDocumentReady(document, notificationsByDocument.get(document.id) ?? [])),
      },
    };
  });

  app.post("/processes/:id/document-ready", async (request, reply) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = dispatchParamsSchema.parse(request.params);
    const input = registerDocumentReadySchema.parse(request.body);
    const current = await getDispatchOrThrow(session.user.storeId, params.id);
    const attachment = await ensureAttachmentInStore(session.user.storeId, input.fileId);
    const receivedAt = input.receivedAt ?? new Date();
    const fileName = input.fileName ?? attachment?.originalName ?? null;

    const result = await prisma.$transaction(async (tx) => {
      const document = await tx.dispatchDocumentReady.create({
        data: {
          storeId: session.user.storeId,
          dispatchProcessId: current.id,
          saleId: current.saleId,
          vehicleId: current.vehicleId,
          buyerId: current.customerId,
          dispatcherId: current.providerId,
          sourceChannel: input.sourceChannel,
          receivedAt,
          receivedFrom: input.receivedFrom,
          fileId: input.fileId ?? null,
          fileName,
          documentType: input.documentType,
          linkedByUserId: session.user.id,
          linkConfidence: input.linkConfidence,
          status: input.status,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });

      if (input.fileId) {
        const links = [
          { storeId: session.user.storeId, attachmentId: input.fileId, entityType: "dispatcher_process", entityId: current.id, purpose: "vehicle_document_ready" },
          { storeId: session.user.storeId, attachmentId: input.fileId, entityType: "sale", entityId: current.saleId, purpose: "vehicle_document_ready" },
          ...(current.customerId ? [{ storeId: session.user.storeId, attachmentId: input.fileId, entityType: "customer", entityId: current.customerId, purpose: "vehicle_document_ready" }] : []),
          ...(current.vehicleId ? [{ storeId: session.user.storeId, attachmentId: input.fileId, entityType: "vehicle", entityId: current.vehicleId, purpose: "vehicle_document_ready" }] : []),
        ];
        await tx.fileAttachmentLink.createMany({ data: links, skipDuplicates: true });
      }

      const process =
        input.markProcessCompleted && input.status === "LINKED"
          ? await tx.dispatcherProcess.update({
              where: { id: current.id },
              data: {
                status: "COMPLETED",
                statusNotes: `Documento pronto registrado (${input.sourceChannel}).`,
                metadata: {
                  ...plainMetadata(current.metadata),
                  lastDispatchAction: "document_ready",
                  documentReadyId: document.id,
                  documentReadyFileId: document.fileId,
                } as Prisma.InputJsonObject,
              },
            })
          : current;

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "dispatch",
          action: "dispatch_document_ready_linked",
          entityType: "dispatch_document_ready",
          entityId: document.id,
          result: "SUCCESS",
          metadata: {
            dispatchProcessId: current.id,
            saleId: current.saleId,
            sourceChannel: document.sourceChannel,
            fileId: document.fileId,
            linkConfidence: document.linkConfidence,
            status: document.status,
          },
        },
      });

      return { document, process };
    });

    await emitInternalEvent({
      name: "dispatch.document_ready_linked",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "dispatch_document_ready",
      entityId: result.document.id,
      payload: { dispatchProcessId: current.id, saleId: current.saleId, status: result.document.status, sourceChannel: result.document.sourceChannel },
    });

    return reply.code(201).send({ data: sanitizeDocumentReady(result.document), process: sanitizeDispatch(result.process) });
  });

  app.post("/processes/:id/document-ready/:documentReadyId/notify-buyer", async (request, reply) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = documentReadyParamsSchema.parse(request.params);
    const input = requestBuyerDocumentReadyNotificationSchema.parse(request.body ?? {});
    const process = await getDispatchOrThrow(session.user.storeId, params.id);
    const document = await getDocumentReadyOrThrow(session.user.storeId, process, params.documentReadyId);
    if (document.status !== "LINKED") {
      throw new ApiError("BUSINESS_RULE_ERROR", "Documento sem vinculo seguro nao pode ser enviado ao comprador.", { status: document.status });
    }
    const attachmentFileId = input.attachmentFileId === undefined ? document.fileId : input.attachmentFileId;
    await ensureAttachmentInStore(session.user.storeId, attachmentFileId);
    const { buyer, vehicle } = await loadBuyerDocumentReadyContext(session.user.storeId, process);
    const delivery = resolveBuyerDelivery({ buyer, requestedChannel: input.channel, recipientContact: input.recipientContact });
    const messageText = input.messageText ?? buildBuyerDocumentReadyMessage({ buyerName: buyer?.name ?? null, vehicle, hasAttachment: Boolean(attachmentFileId) });
    const previousAttempts = await prisma.buyerDocumentReadyNotification.count({ where: { storeId: session.user.storeId, documentReadyId: document.id } });
    const sentAt = ["SENT", "DELIVERED", "RESENT"].includes(input.status) ? input.sentAt ?? new Date() : input.sentAt;

    const notification = await prisma.$transaction(async (tx) => {
      const created = await tx.buyerDocumentReadyNotification.create({
        data: {
          storeId: session.user.storeId,
          documentReadyId: document.id,
          dispatchProcessId: process.id,
          saleId: process.saleId,
          buyerId: process.customerId,
          vehicleId: process.vehicleId,
          channel: delivery.channel,
          recipientContact: delivery.recipientContact,
          messageTemplateId: input.messageTemplateId ?? null,
          messageTextSnapshot: messageText,
          attachmentFileId: attachmentFileId ?? null,
          sentAt,
          sentByUserId: session.user.id,
          sentBy: "USER",
          status: input.status,
          failureReason: input.failureReason,
          retryCount: previousAttempts,
          metadata: {
            ...(input.metadata ?? {}),
            deliveryMode: buyerDeliveryMode(delivery.channel, input.status),
            providerApproved: false,
          } as Prisma.InputJsonObject,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "dispatch",
          action: "buyer_document_ready_notification_requested",
          entityType: "buyer_document_ready_notification",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            documentReadyId: document.id,
            dispatchProcessId: process.id,
            saleId: process.saleId,
            channel: created.channel,
            status: created.status,
            retryCount: created.retryCount,
            attachmentFileId: created.attachmentFileId,
          },
        },
      });

      return created;
    });

    if (delivery.channel === "MANUAL" || !delivery.recipientContact) {
      await notifyManualBuyerDocumentContactRequired(session.user.storeId, process, session.user.id);
    }

    await emitInternalEvent({
      name: "dispatch.buyer_document_ready_notification_requested",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "buyer_document_ready_notification",
      entityId: notification.id,
      payload: { documentReadyId: document.id, saleId: process.saleId, channel: notification.channel, status: notification.status },
    });

    return reply.code(201).send({
      data: sanitizeBuyerDocumentReadyNotification(notification),
      delivery: {
        channel: delivery.channel,
        recipientContact: delivery.recipientContact,
        mode: buyerDeliveryMode(delivery.channel, notification.status),
        providerApproved: false,
      },
    });
  });

  app.patch("/processes/:id/document-ready/:documentReadyId/notifications/:notificationId", async (request) => {
    const session = await requirePermission(request, { module: "dispatch", action: "manage", scope: "STORE", sensitiveArea: "general" });
    const params = documentReadyNotificationParamsSchema.parse(request.params);
    const input = updateBuyerDocumentReadyNotificationSchema.parse(request.body);
    const process = await getDispatchOrThrow(session.user.storeId, params.id);
    const document = await getDocumentReadyOrThrow(session.user.storeId, process, params.documentReadyId);
    const current = await getBuyerDocumentReadyNotificationOrThrow(session.user.storeId, document.id, params.notificationId);
    const nextStatus = input.status ?? current.status;
    const nextSentAt = input.sentAt === undefined ? (["SENT", "DELIVERED", "RESENT"].includes(nextStatus) ? current.sentAt ?? new Date() : undefined) : input.sentAt;

    const notification = await prisma.$transaction(async (tx) => {
      const changed = await tx.buyerDocumentReadyNotification.updateMany({
        where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
        data: {
          status: input.status,
          sentAt: nextSentAt,
          failureReason: input.failureReason === undefined ? undefined : input.failureReason,
          metadata: input.metadata === undefined ? undefined : input.metadata === null ? Prisma.JsonNull : (input.metadata as Prisma.InputJsonObject),
        },
      });
      if (changed.count !== 1) {
        throw new ApiError("CONFLICT", "Aviso ao comprador foi alterado por outra acao. Recarregue e tente novamente.");
      }

      const updated = await tx.buyerDocumentReadyNotification.findUniqueOrThrow({ where: { id: current.id } });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "dispatch",
          action: "buyer_document_ready_notification_updated",
          entityType: "buyer_document_ready_notification",
          entityId: current.id,
          result: "SUCCESS",
          metadata: { documentReadyId: document.id, saleId: process.saleId, changedFields: Object.keys(input), fromStatus: current.status, toStatus: updated.status },
        },
      });
      return updated;
    });

    return { data: sanitizeBuyerDocumentReadyNotification(notification) };
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
