import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { isCommercialFullView } from "../auth/commercial-scope.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { isAddressProofExpired, isAddressProofItem } from "../services/sale-document-checklist.js";
import { PAYMENT_RELEASED_STATUS } from "../services/sale-payment-check.js";
import {
  SALE_INSPECTION_REPORT_STATUSES,
  requiredSaleInspectionReportBlockers,
  summarizeSaleInspectionReports,
  type SaleInspectionReportStatus,
} from "../services/sale-inspection-report.js";

const contractQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  sale_id: z.string().uuid().optional(),
  status: z.string().trim().max(60).optional(),
});

const packageStatusSchema = z.enum([
  "DRAFT",
  "IN_ADMIN_REVIEW",
  "READY_FOR_SIGNATURE",
  "SENT_TO_GOV_BR",
  "SENT_TO_CDT",
  "SENT_TO_E_NOTARIADO",
  "SENT_TO_CARTORIO_FISICO",
  "WAITING_SELLER_SIGNATURE",
  "WAITING_BUYER_SIGNATURE",
  "PARTIALLY_SIGNED",
  "SIGNED_ALL",
  "DOCUMENT_ATTACHED",
  "REJECTED_NEEDS_CORRECTION",
  "CANCELLED",
  "BLOCKED_BY_PREREQUISITE",
] as const);
const signatureProviderSchema = z.enum(["GOV_BR", "CDT_DIGITAL", "E_NOTARIADO", "CARTORIO_FISICO", "MANUAL", "OUTRO"] as const);
const signaturePartyStatusSchema = z.enum(["PENDING", "AWAITING", "SIGNED", "REJECTED", "NOT_APPLICABLE"] as const);
const vehicleTransferModeSchema = z.enum(["CDT_DIGITAL", "E_NOTARIADO", "CARTORIO_FISICO", "MANUAL", "NOT_DEFINED"] as const);
const atpveStatusSchema = z.enum(["NOT_STARTED", "PENDING", "SENT", "SIGNED_SELLER", "SIGNED_BUYER", "COMPLETED", "BLOCKED", "NOT_APPLICABLE"] as const);
const inspectionReportTypeSchema = z.enum(["CAUTIONARY", "TRANSFER"] as const);
const inspectionReportStatusSchema = z.enum(SALE_INSPECTION_REPORT_STATUSES);
const inspectionExportActionSchema = z.enum(["VIEW", "DOWNLOAD", "PRINT"] as const);

const generateContractSchema = z.object({
  saleId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  status: z.string().trim().min(2).max(60).default("GENERATED"),
  snapshot: z.record(z.unknown()).optional(),
});

const packageQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  sale_id: z.string().uuid().optional(),
  status: packageStatusSchema.optional(),
  signature_provider: signatureProviderSchema.optional(),
});

const packageParamsSchema = z.object({ id: z.string().uuid() });

const createContractPackageSchema = z.object({
  saleId: z.string().uuid(),
  contractId: z.string().uuid().optional(),
  documentType: z.string().trim().min(2).max(80).default("SALE_CONTRACT_PACKAGE"),
  status: packageStatusSchema.default("DRAFT"),
  generatedFileId: z.string().uuid().nullable().optional(),
  signatureProvider: signatureProviderSchema.optional(),
  vehicleTransferMode: vehicleTransferModeSchema.optional(),
  govbrLevelRequired: z.string().trim().max(60).optional(),
  vehicleDocumentEligibleForAtpve: z.boolean().optional(),
  reviewNotes: z.string().trim().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const reviewContractPackageSchema = z.object({
  observationsReviewed: z.literal(true),
  reviewNotes: z.string().trim().max(1000).optional(),
});

const sendContractPackageSchema = z.object({
  signatureProvider: signatureProviderSchema,
  vehicleTransferMode: vehicleTransferModeSchema,
  govbrLevelRequired: z.string().trim().max(60).optional(),
  vehicleDocumentEligibleForAtpve: z.boolean().optional(),
  buyerNotificationChannel: z.enum(["WHATSAPP", "EMAIL", "PHONE", "MANUAL", "NONE"]).default("MANUAL"),
  buyerNotificationRecipient: z.string().trim().max(160).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const registerSignedPackageSchema = z.object({
  signedFileId: z.string().uuid(),
  atpveFileId: z.string().uuid().nullable().optional(),
  atpveEvidenceFileId: z.string().uuid().nullable().optional(),
  sellerSignatureStatus: signaturePartyStatusSchema.default("SIGNED"),
  buyerSignatureStatus: signaturePartyStatusSchema.default("SIGNED"),
  atpveStatus: atpveStatusSchema.default("COMPLETED"),
  signedAt: z.coerce.date().optional(),
  signatureHash: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const inspectionReportQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  sale_id: z.string().uuid().optional(),
  vehicle_id: z.string().uuid().optional(),
  report_type: inspectionReportTypeSchema.optional(),
  status: inspectionReportStatusSchema.optional(),
});

const inspectionReportParamsSchema = z.object({ id: z.string().uuid() });

const updateInspectionReportSchema = z
  .object({
    status: inspectionReportStatusSchema.optional(),
    reportFileId: z.string().uuid().nullable().optional(),
    reportDate: z.coerce.date().nullable().optional(),
    serviceProviderId: z.string().uuid().nullable().optional(),
    requestedByCustomer: z.boolean().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    replacementReason: z.string().trim().max(500).nullable().optional(),
    rejectionReason: z.string().trim().max(500).nullable().optional(),
    waiverReason: z.string().trim().max(500).nullable().optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "Informe ao menos um campo para atualizar.",
  })
  .superRefine((input, ctx) => {
    if (input.status === "REJECTED" && !input.rejectionReason && !input.notes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe motivo/observacao para recusar laudo.", path: ["rejectionReason"] });
    }
    if (input.status === "WAIVED" && !input.waiverReason && !input.notes) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Informe justificativa para dispensar laudo.", path: ["waiverReason"] });
    }
  });

const exportInspectionReportSchema = z.object({
  action: inspectionExportActionSchema,
  requestedByCustomer: z.boolean().default(false),
  notes: z.string().trim().max(500).optional(),
});

const contractParamsSchema = z.object({
  id: z.string().uuid(),
});

const signContractSchema = z.object({
  signedAt: z.coerce.date().optional(),
  reason: z.string().trim().max(300).optional(),
});

const warrantyTermQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  sale_id: z.string().uuid().optional(),
  status: z.string().trim().max(60).optional(),
  signed_status: z.string().trim().max(60).optional(),
});

const warrantyTermParamsSchema = z.object({ id: z.string().uuid() });
const saleSignatureSummaryParamsSchema = z.object({ saleId: z.string().uuid() });
const warrantyTermDocumentQuerySchema = z.object({ format: z.enum(["json", "html"] as const).default("json") });

const warrantyTermSchema = z.object({
  saleId: z.string().uuid(),
  sourceContractId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  terms: z.record(z.unknown()).optional(),
});

const printWarrantyTermSchema = z
  .object({
    printerConfigured: z.coerce.boolean().default(false),
    reason: z.string().trim().max(300).optional(),
  })
  .default({ printerConfigured: false });

const confirmWarrantySignatureSchema = z.object({
  signedStatus: z.enum(["SIGNED", "WAIVED"] as const).default("SIGNED"),
  observation: z.string().trim().max(1000).optional(),
  allDocumentsSignedStatus: z.enum(["ALL_SIGNED", "PARTIALLY_SIGNED", "PENDING_SIGNATURES"] as const).optional(),
});

const deliveryChecklistSchema = z.object({
  saleId: z.string().uuid(),
  checklist: z.record(z.unknown()),
  status: z.string().trim().min(2).max(60).default("PENDING"),
  deliveredAt: z.coerce.date().optional(),
});

type ContractRecord = {
  id: string;
  saleId: string;
  templateId: string | null;
  version: number;
  status: string;
  snapshot: unknown;
  generatedAt: Date;
  signedAt: Date | null;
};

type ContractPackageRecord = Prisma.ContractDocumentPackageGetPayload<Record<string, never>>;
type WarrantyTermRecord = Prisma.WarrantyTermGetPayload<Record<string, never>>;
type SaleRecord = Prisma.SaleGetPayload<Record<string, never>>;
type SaleInspectionReportRecord = Prisma.SaleInspectionReportGetPayload<Record<string, never>>;

function sanitizeContract(contract: ContractRecord) {
  return {
    id: contract.id,
    saleId: contract.saleId,
    templateId: contract.templateId,
    version: contract.version,
    status: contract.status,
    snapshot: contract.snapshot,
    generatedAt: contract.generatedAt.toISOString(),
    signedAt: contract.signedAt?.toISOString() ?? null,
  };
}

function sanitizeContractPackage(item: ContractPackageRecord) {
  return {
    id: item.id,
    saleId: item.saleId,
    contractId: item.contractId,
    documentType: item.documentType,
    status: item.status,
    generatedFileId: item.generatedFileId,
    signedFileId: item.signedFileId,
    signatureProvider: item.signatureProvider,
    sellerSignatureStatus: item.sellerSignatureStatus,
    buyerSignatureStatus: item.buyerSignatureStatus,
    sentAt: item.sentAt?.toISOString() ?? null,
    signedAt: item.signedAt?.toISOString() ?? null,
    buyerNotifiedAt: item.buyerNotifiedAt?.toISOString() ?? null,
    buyerNotificationChannel: item.buyerNotificationChannel,
    buyerNotificationRecipient: item.buyerNotificationRecipient,
    vehicleTransferMode: item.vehicleTransferMode,
    atpveStatus: item.atpveStatus,
    atpveFileId: item.atpveFileId,
    atpveEvidenceFileId: item.atpveEvidenceFileId,
    govbrLevelRequired: item.govbrLevelRequired,
    vehicleDocumentEligibleForAtpve: item.vehicleDocumentEligibleForAtpve,
    observationsReviewed: item.observationsReviewed,
    reviewedByUserId: item.reviewedByUserId,
    reviewedAt: item.reviewedAt?.toISOString() ?? null,
    reviewNotes: item.reviewNotes,
    signatureHash: item.signatureHash,
    guidance: item.guidance,
    metadata: item.metadata,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function sanitizeInspectionReport(item: SaleInspectionReportRecord) {
  return {
    id: item.id,
    saleId: item.saleId,
    vehicleId: item.vehicleId,
    customerId: item.customerId,
    reportType: item.reportType,
    status: item.status,
    isRequired: item.isRequired,
    reportFileId: item.reportFileId,
    reportDate: item.reportDate?.toISOString() ?? null,
    attachedByUserId: item.attachedByUserId,
    attachedAt: item.attachedAt?.toISOString() ?? null,
    checkedByUserId: item.checkedByUserId,
    checkedAt: item.checkedAt?.toISOString() ?? null,
    serviceProviderId: item.serviceProviderId,
    requestedByCustomer: item.requestedByCustomer,
    printedAt: item.printedAt?.toISOString() ?? null,
    printedByUserId: item.printedByUserId,
    exportedAt: item.exportedAt?.toISOString() ?? null,
    exportedByUserId: item.exportedByUserId,
    retentionUntil: item.retentionUntil?.toISOString() ?? null,
    deleteAfterRetentionStatus: item.deleteAfterRetentionStatus,
    replacementReason: item.replacementReason,
    rejectionReason: item.rejectionReason,
    waiverReason: item.waiverReason,
    notes: item.notes,
    metadata: item.metadata,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function sanitizeWarrantyTerm(item: WarrantyTermRecord) {
  return {
    id: item.id,
    saleId: item.saleId,
    sourceContractId: item.sourceContractId,
    templateId: item.templateId,
    generatedFileId: item.generatedFileId,
    status: item.status,
    terms: item.terms,
    snapshot: item.snapshot,
    generatedAt: item.generatedAt?.toISOString() ?? null,
    printedAt: item.printedAt?.toISOString() ?? null,
    printedByUserId: item.printedByUserId,
    signedStatus: item.signedStatus,
    signedConfirmedAt: item.signedConfirmedAt?.toISOString() ?? null,
    signedConfirmedByUserId: item.signedConfirmedByUserId,
    signatureObservation: item.signatureObservation,
    allDocumentsSignedStatus: item.allDocumentsSignedStatus,
    reprintCount: item.reprintCount,
    lastReprintAt: item.lastReprintAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function defaultWarrantyTerms(input: { startsAt: Date; endsAt: Date }) {
  return {
    model: "PRD_WARRANTY_TERM_90_DAYS",
    legalTextLocked: true,
    termDays: 90,
    startsAt: input.startsAt.toISOString(),
    endsAt: input.endsAt.toISOString(),
    coverage: [
      "Garantia legal de 90 dias conforme Codigo de Defesa do Consumidor para itens obrigatorios aplicaveis.",
      "Cobertura limitada aos termos juridicos padronizados do PRD e ao estado do veiculo registrado no processo de venda.",
    ],
    exclusions: [
      "Mau uso, avarias posteriores a entrega, alteracoes nao autorizadas e itens de desgaste natural fora das condicoes legais.",
      "Servicos executados por terceiros sem autorizacao da loja durante a vigencia da garantia.",
    ],
    conditions: [
      "Cliente deve comunicar a loja antes de qualquer reparo externo.",
      "O termo nao pode ter clausulas alteradas no momento da emissao; somente campos variaveis do processo sao preenchidos.",
    ],
  };
}

async function buildWarrantyTermDocument(
  tx: Prisma.TransactionClient,
  input: {
  storeId: string;
  saleId: string;
  sourceContractId?: string | null;
  templateId?: string | null;
  terms?: Record<string, unknown>;
  generatedAt?: Date;
}) {
  const sale = await tx.sale.findFirst({ where: { id: input.saleId, storeId: input.storeId, deletedAt: null } });
  if (!sale) {
    throw new ApiError("NOT_FOUND", "Venda do contrato nao encontrada.");
  }
  const sourceContract = input.sourceContractId
    ? await tx.contract.findFirst({ where: { id: input.sourceContractId, storeId: input.storeId }, select: { id: true, saleId: true } })
    : await tx.contract.findFirst({ where: { storeId: input.storeId, saleId: sale.id }, orderBy: { generatedAt: "desc" }, select: { id: true, saleId: true } });
  if (input.sourceContractId && !sourceContract) {
    throw new ApiError("NOT_FOUND", "Contrato do termo de garantia nao encontrado.");
  }
  if (sourceContract && sourceContract.saleId !== sale.id) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Contrato informado nao pertence a venda do termo de garantia.");
  }

  const [store, customer, vehicle, seller, contract] = await Promise.all([
    tx.store.findFirst({ where: { id: input.storeId }, select: { id: true, name: true, legalName: true, cnpj: true } }),
    sale.customerId ? tx.customer.findFirst({ where: { id: sale.customerId, storeId: input.storeId }, select: { id: true, name: true, document: true, phone: true, email: true } }) : Promise.resolve(null),
    sale.vehicleId
      ? tx.vehicle.findFirst({
          where: { id: sale.vehicleId, storeId: input.storeId },
          select: { id: true, brand: true, model: true, version: true, yearModel: true, yearBuild: true, plate: true, vin: true, color: true, mileage: true },
        })
      : Promise.resolve(null),
    sale.sellerUserId ? tx.user.findFirst({ where: { id: sale.sellerUserId, storeId: input.storeId }, select: { id: true, name: true, email: true } }) : Promise.resolve(null),
    sourceContract?.id ? tx.contract.findFirst({ where: { id: sourceContract.id, storeId: input.storeId }, select: { id: true, version: true, generatedAt: true, signedAt: true, snapshot: true } }) : Promise.resolve(null),
  ]);

  const missing = [!store ? "store" : null, !customer ? "customer" : null, !vehicle ? "vehicle" : null, !seller ? "seller" : null].filter(
    (item): item is string => Boolean(item),
  );
  if (missing.length > 0) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Termo de garantia bloqueado: dados obrigatorios da venda incompletos.", { missing });
  }

  const generatedAt = input.generatedAt ?? new Date();
  const startsAt = sale.closedAt ?? contract?.signedAt ?? contract?.generatedAt ?? generatedAt;
  const endsAt = addDays(startsAt, 90);
  const terms = input.terms ?? defaultWarrantyTerms({ startsAt, endsAt });
  const snapshot = {
    documentType: "WARRANTY_TERM_90_DAYS",
    generatedAt: generatedAt.toISOString(),
    templateId: input.templateId ?? null,
    store,
    customer,
    vehicle,
    seller,
    sale: {
      id: sale.id,
      status: sale.status,
      salePrice: sale.salePrice?.toString() ?? null,
      closedAt: sale.closedAt?.toISOString() ?? null,
    },
    sourceContract: contract
      ? { id: contract.id, version: contract.version, generatedAt: contract.generatedAt.toISOString(), signedAt: contract.signedAt?.toISOString() ?? null }
      : null,
    warranty: {
      termDays: 90,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      legalTextLocked: true,
    },
    terms,
  };

  const html = renderWarrantyTermHtml(snapshot);
  return { sale, sourceContractId: contract?.id ?? null, generatedAt, terms, snapshot, html };
}

function renderWarrantyTermHtml(snapshot: Record<string, unknown>) {
  const store = snapshot.store as { legalName?: string | null; name?: string | null; cnpj?: string | null } | null;
  const customer = snapshot.customer as { name?: string | null; document?: string | null } | null;
  const vehicle = snapshot.vehicle as { brand?: string | null; model?: string | null; version?: string | null; plate?: string | null; vin?: string | null; yearModel?: number | null; mileage?: number | null } | null;
  const warranty = snapshot.warranty as { startsAt?: string; endsAt?: string; termDays?: number } | null;
  const sale = snapshot.sale as { id?: string; salePrice?: string | null; closedAt?: string | null } | null;
  const seller = snapshot.seller as { name?: string | null } | null;
  const terms = snapshot.terms as { coverage?: string[]; exclusions?: string[]; conditions?: string[] } | null;
  const list = (items: string[] | undefined) => (items ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>Termo de Garantia 90 Dias</title></head>
<body>
  <h1>Termo de Garantia de 90 Dias</h1>
  <p><strong>Loja:</strong> ${escapeHtml(store?.legalName ?? store?.name)} - CNPJ ${escapeHtml(store?.cnpj)}</p>
  <p><strong>Comprador:</strong> ${escapeHtml(customer?.name)} - Documento ${escapeHtml(customer?.document)}</p>
  <p><strong>Veiculo:</strong> ${escapeHtml([vehicle?.brand, vehicle?.model, vehicle?.version].filter(Boolean).join(" "))} - Placa ${escapeHtml(vehicle?.plate)} - Chassi ${escapeHtml(vehicle?.vin)} - Ano ${escapeHtml(vehicle?.yearModel)} - KM ${escapeHtml(vehicle?.mileage)}</p>
  <p><strong>Negociacao:</strong> ${escapeHtml(sale?.id)} - Valor ${escapeHtml(sale?.salePrice)} - Vendedor ${escapeHtml(seller?.name)}</p>
  <p><strong>Vigencia:</strong> ${escapeHtml(warranty?.termDays)} dias, de ${escapeHtml(warranty?.startsAt)} ate ${escapeHtml(warranty?.endsAt)}.</p>
  <h2>Coberturas</h2><ul>${list(terms?.coverage)}</ul>
  <h2>Exclusoes</h2><ul>${list(terms?.exclusions)}</ul>
  <h2>Condicoes</h2><ul>${list(terms?.conditions)}</ul>
  <p>As clausulas juridicas deste termo sao padronizadas e nao devem ser alteradas no momento da emissao.</p>
  <br><p>__________________________________<br>Assinatura do cliente</p>
</body>
</html>`;
}

async function createWarrantyTermDocument(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    actorId: string;
    actorRole: string;
    saleId: string;
    sourceContractId?: string | null;
    templateId?: string | null;
    terms?: Record<string, unknown>;
    action: string;
  },
) {
  const document = await buildWarrantyTermDocument(tx, input);
  const warrantyId = randomUUID();
  const attachmentId = randomUUID();
  const storagePath = `${input.storeId}/warranty_terms/${warrantyId}/${attachmentId}-termo-garantia-90-dias.html`;
  const file = await tx.fileAttachment.create({
    data: {
      id: attachmentId,
      storeId: input.storeId,
      bucket: "system-generated",
      path: storagePath,
      originalName: `termo-garantia-90-dias-${document.sale.id}.html`,
      mimeType: "text/html",
      sizeBytes: Buffer.byteLength(document.html, "utf8"),
      classification: "warranty_term_90_days",
      uploadedByUserId: input.actorId,
    },
  });

  const targets = [
    { entityType: "sale", entityId: document.sale.id },
    document.sale.vehicleId ? { entityType: "vehicle", entityId: document.sale.vehicleId } : null,
    document.sale.customerId ? { entityType: "customer", entityId: document.sale.customerId } : null,
    document.sourceContractId ? { entityType: "contract", entityId: document.sourceContractId } : null,
  ].filter((item): item is { entityType: string; entityId: string } => Boolean(item));
  await tx.fileAttachmentLink.createMany({
    data: targets.map((target) => ({ storeId: input.storeId, attachmentId: file.id, entityType: target.entityType, entityId: target.entityId, purpose: "warranty_term_90_days" })),
    skipDuplicates: true,
  });

  await tx.documentVersion.create({
    data: {
      storeId: input.storeId,
      attachmentId: file.id,
      version: 1,
      snapshot: { document: document.snapshot, html: document.html } as Prisma.InputJsonObject,
    },
  });

  const warranty = await tx.warrantyTerm.create({
    data: {
      id: warrantyId,
      storeId: input.storeId,
      saleId: document.sale.id,
      sourceContractId: document.sourceContractId,
      templateId: input.templateId,
      generatedFileId: file.id,
      status: "READY_TO_PRINT",
      terms: document.terms as Prisma.InputJsonObject,
      snapshot: document.snapshot as Prisma.InputJsonObject,
      generatedAt: document.generatedAt,
      signedStatus: "PENDING",
      allDocumentsSignedStatus: "PENDING_SIGNATURES",
    },
  });

  await tx.auditLog.create({
    data: {
      storeId: input.storeId,
      actorId: input.actorId,
      actorRole: input.actorRole,
      module: "documents",
      action: input.action,
      entityType: "warranty_term",
      entityId: warranty.id,
      result: "SUCCESS",
      metadata: { saleId: warranty.saleId, sourceContractId: warranty.sourceContractId, generatedFileId: warranty.generatedFileId },
    },
  });

  return warranty;
}
function signatureGuidance(signatureProvider: string | null | undefined, vehicleTransferMode: string | null | undefined) {
  const provider = signatureProvider ?? "MANUAL";
  const base = {
    provider,
    vehicleTransferMode: vehicleTransferMode ?? "NOT_DEFINED",
    externalIntegration: false,
    disclaimer: "Fluxo assistido: o CRM orienta e registra evidencias, mas nao assina automaticamente em Gov.br/CDT/Detran/e-Notariado.",
  };

  if (provider === "CDT_DIGITAL") {
    return {
      ...base,
      govbrLevelRequired: "PRATA_OURO",
      steps: [
        "Confirmar elegibilidade ATPV-e/Venda Digital do veiculo.",
        "Confirmar conta Gov.br Prata/Ouro para vendedor e comprador.",
        "Vendedor inicia Venda Digital no app CDT com dados do comprador.",
        "Comprador recebe notificacao no CDT e assina digitalmente.",
        "Anexar evidencia/status final ao pacote contratual.",
      ],
    };
  }

  if (provider === "E_NOTARIADO") {
    return {
      ...base,
      steps: [
        "Obter ATPV-e pelo procedimento do Detran/UF.",
        "Encaminhar documento para e-Notariado/e-Not Assina quando aplicavel.",
        "Registrar custos, status, assinaturas e reconhecimento.",
        "Anexar documento assinado/reconhecido ao pacote.",
      ],
    };
  }

  if (provider === "CARTORIO_FISICO") {
    return {
      ...base,
      steps: [
        "Separar recibo/DUT/ATPV-e fisico aplicavel.",
        "Reconhecer firma por autenticidade conforme regra operacional.",
        "Registrar cartorio, responsavel, datas e evidencias.",
        "Anexar documento reconhecido ao pacote.",
      ],
    };
  }

  return {
    ...base,
    steps: [
      "Gerar documento compativel para assinatura.",
      "Conferir dados de venda, comprador, veiculo, pagamento e observacoes.",
      "Enviar manualmente pelo canal definido e anexar evidencia do retorno assinado.",
    ],
  };
}

async function getSaleOrThrow(storeId: string, id: string) {
  const sale = await prisma.sale.findFirst({
    where: { id, storeId, deletedAt: null },
  });

  if (!sale) {
    throw new ApiError("NOT_FOUND", "Venda do contrato nao encontrada.");
  }

  return sale;
}

async function getContractOrThrow(storeId: string, id: string) {
  const contract = await prisma.contract.findFirst({
    where: { id, storeId },
  });

  if (!contract) {
    throw new ApiError("NOT_FOUND", "Contrato nao encontrado.");
  }

  return contract;
}

async function getContractPackageOrThrow(storeId: string, id: string) {
  const item = await prisma.contractDocumentPackage.findFirst({ where: { id, storeId } });
  if (!item) {
    throw new ApiError("NOT_FOUND", "Pacote contratual nao encontrado.");
  }
  return item;
}
async function getWarrantyTermOrThrow(storeId: string, id: string) {
  const item = await prisma.warrantyTerm.findFirst({ where: { id, storeId } });
  if (!item) {
    throw new ApiError("NOT_FOUND", "Termo de garantia nao encontrado.");
  }
  return item;
}

function isWarrantySigned(item: Pick<WarrantyTermRecord, "signedStatus"> | null | undefined) {
  return item?.signedStatus === "SIGNED" || item?.signedStatus === "WAIVED";
}

function isTransferPackageSigned(item: Pick<ContractPackageRecord, "status" | "sellerSignatureStatus" | "buyerSignatureStatus" | "atpveStatus"> | null | undefined) {
  if (!item) {
    return true;
  }
  return (
    item.status === "SIGNED_ALL" ||
    (item.sellerSignatureStatus === "SIGNED" &&
      item.buyerSignatureStatus === "SIGNED" &&
      (item.atpveStatus === "COMPLETED" || item.atpveStatus === "NOT_APPLICABLE"))
  );
}

async function buildSaleSignatureSummary(storeId: string, saleId: string) {
  const [contract, warrantyTerm, transferPackage, paidIncome, paymentChecks, inspectionReports] = await Promise.all([
    prisma.contract.findFirst({ where: { storeId, saleId }, orderBy: { generatedAt: "desc" } }),
    prisma.warrantyTerm.findFirst({ where: { storeId, saleId }, orderBy: [{ generatedAt: "desc" }, { createdAt: "desc" }] }),
    prisma.contractDocumentPackage.findFirst({ where: { storeId, saleId }, orderBy: { createdAt: "desc" } }),
    prisma.financialTransaction.findFirst({
      where: { storeId, entityType: "sale", entityId: saleId, type: "INCOME", status: "PAID", deletedAt: null },
      select: { id: true, paidAt: true },
      orderBy: { paidAt: "desc" },
    }),
    prisma.salePaymentCheck.findMany({
      where: { storeId, saleId, isRequired: true },
      select: { id: true, paymentItemType: true, releaseStatus: true },
    }),
    prisma.saleInspectionReport.findMany({
      where: { storeId, saleId, isRequired: true },
      select: { id: true, reportType: true, status: true, isRequired: true },
    }),
  ]);
  const contractSigned = contract?.status === "SIGNED" && Boolean(contract.signedAt);
  const warrantySigned = isWarrantySigned(warrantyTerm);
  const packageSigned = isTransferPackageSigned(transferPackage);
  const paymentReleased = paymentChecks.length > 0 ? paymentChecks.every((item) => item.releaseStatus === PAYMENT_RELEASED_STATUS) : Boolean(paidIncome);
  const pendingInspectionReports = requiredSaleInspectionReportBlockers(inspectionReports);
  const pendingItems = [
    !contractSigned ? "contract_signed" : null,
    !warrantyTerm ? "warranty_term_generated" : null,
    warrantyTerm && !warrantySigned ? "warranty_term_signed" : null,
    !packageSigned ? "transfer_package_signed" : null,
    !paymentReleased ? "payment_confirmed" : null,
    pendingInspectionReports.length > 0 ? "inspection_reports_checked" : null,
  ].filter((item): item is string => Boolean(item));

  return {
    saleId,
    overallStatus: pendingItems.length === 0 ? "ALL_SIGNED" : "PENDING_SIGNATURES",
    allDocumentsSignedStatus: warrantyTerm?.allDocumentsSignedStatus ?? (pendingItems.length === 0 ? "ALL_SIGNED" : "PENDING_SIGNATURES"),
    pendingItems,
    contract: contract
      ? { id: contract.id, status: contract.status, signedAt: contract.signedAt?.toISOString() ?? null, generatedAt: contract.generatedAt.toISOString() }
      : null,
    warrantyTerm: warrantyTerm ? sanitizeWarrantyTerm(warrantyTerm) : null,
    transferPackage: transferPackage
      ? {
          id: transferPackage.id,
          status: transferPackage.status,
          sellerSignatureStatus: transferPackage.sellerSignatureStatus,
          buyerSignatureStatus: transferPackage.buyerSignatureStatus,
          atpveStatus: transferPackage.atpveStatus,
          signedAt: transferPackage.signedAt?.toISOString() ?? null,
        }
      : null,
    payment: {
      paidTransactionId: paidIncome?.id ?? null,
      paidAt: paidIncome?.paidAt?.toISOString() ?? null,
      paymentCheckIds: paymentChecks.map((item) => item.id),
      released: paymentReleased,
    },
    inspectionReports: {
      blockedForRelease: pendingInspectionReports.length > 0,
      pendingInspectionReports,
    },
  };
}
async function ensureAttachmentInStore(storeId: string, attachmentId: string | null | undefined) {
  if (!attachmentId) {
    return;
  }
  const attachment = await prisma.fileAttachment.findFirst({
    where: { id: attachmentId, storeId, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (!attachment) {
    throw new ApiError("NOT_FOUND", "Anexo do pacote contratual nao encontrado.");
  }
}

async function ensureServiceProviderInStore(storeId: string, providerId: string | null | undefined) {
  if (!providerId) {
    return;
  }
  const provider = await prisma.serviceProvider.findFirst({ where: { id: providerId, storeId, deletedAt: null }, select: { id: true } });
  if (!provider) {
    throw new ApiError("NOT_FOUND", "Prestador do laudo nao encontrado.");
  }
}

async function ensureContractBelongsToSale(storeId: string, contractId: string | null | undefined, saleId: string) {
  if (!contractId) {
    return null;
  }
  const contract = await prisma.contract.findFirst({ where: { id: contractId, storeId }, select: { id: true, saleId: true } });
  if (!contract) {
    throw new ApiError("NOT_FOUND", "Contrato do pacote nao encontrado.");
  }
  if (contract.saleId !== saleId) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Contrato informado nao pertence a venda do pacote.");
  }
  return contract;
}

async function buildSaleSnapshot(storeId: string, saleId: string, extra?: Record<string, unknown>) {
  const sale = await getSaleOrThrow(storeId, saleId);
  const customer = sale.customerId
    ? await prisma.customer.findFirst({ where: { id: sale.customerId, storeId }, select: { id: true, name: true, document: true } })
    : null;
  const vehicle = sale.vehicleId
    ? await prisma.vehicle.findFirst({
        where: { id: sale.vehicleId, storeId },
        select: { id: true, brand: true, model: true, version: true, plate: true, mileage: true },
      })
    : null;

  return {
    sale: {
      id: sale.id,
      type: sale.type,
      status: sale.status,
      salePrice: sale.salePrice?.toString() ?? null,
      grossMargin: sale.grossMargin?.toString() ?? null,
      closedAt: sale.closedAt?.toISOString() ?? null,
    },
    customer,
    vehicle,
    extra: extra ?? {},
  };
}

function ensureSaleLinksReadyForContractPackage(sale: SaleRecord) {
  const missing = [
    !sale.customerId ? "customer" : null,
    !sale.vehicleId ? "vehicle" : null,
    !sale.sellerUserId ? "seller" : null,
    !sale.salePrice ? "sale_price" : null,
  ].filter((item): item is string => Boolean(item));

  if (missing.length > 0) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Pacote contratual bloqueado: venda incompleta.", { missing });
  }
}

async function ensureInspectionReportsReadyForSale(storeId: string, saleId: string) {
  const reports = await prisma.saleInspectionReport.findMany({
    where: { storeId, saleId, isRequired: true },
    select: { reportType: true, status: true, isRequired: true },
  });
  const pendingInspectionReports = requiredSaleInspectionReportBlockers(reports);
  if (pendingInspectionReports.length > 0) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Operacao bloqueada por laudo obrigatorio pendente.", { pendingInspectionReports });
  }
}

async function ensureBuyerDocumentsReadyForContract(storeId: string, sale: Awaited<ReturnType<typeof getSaleOrThrow>>) {
  if (sale.status !== "DOCUMENTATION") {
    return;
  }

  const checklist = await prisma.saleDocumentChecklist.findMany({
    where: { storeId, saleId: sale.id, isRequired: true },
    select: { itemKey: true, label: true, status: true, isDone: true, issueDate: true, metadata: true },
  });

  if (checklist.length === 0) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Contrato bloqueado: checklist documental do comprador ainda nao foi criado.", {
      pendingDocumentItems: [{ itemKey: "buyer_document_checklist", reason: "missing_checklist" }],
    });
  }

  const pendingDocumentItems = checklist
    .flatMap((item) => {
      const issues: Array<{ itemKey: string; label: string; reason: string; status: string }> = [];
      if (!item.isDone) {
        issues.push({ itemKey: item.itemKey, label: item.label, reason: "required_pending", status: item.status });
      }
      if (isAddressProofItem(item.itemKey, item.metadata) && isAddressProofExpired(item.issueDate)) {
        issues.push({ itemKey: item.itemKey, label: item.label, reason: "address_proof_expired", status: item.status });
      }
      return issues;
    });

  if (pendingDocumentItems.length > 0) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Contrato bloqueado por pendencia documental obrigatoria.", { pendingDocumentItems });
  }
}

async function ensurePaymentReadyForContractPackage(storeId: string, saleId: string) {
  const checks = await prisma.salePaymentCheck.findMany({
    where: { storeId, saleId, isRequired: true },
    select: { id: true, paymentItemType: true, releaseStatus: true },
  });

  if (checks.length === 0) {
    return;
  }

  const pendingPaymentChecks = checks.filter((item) => item.releaseStatus !== PAYMENT_RELEASED_STATUS);
  if (pendingPaymentChecks.length > 0) {
    throw new ApiError("BUSINESS_RULE_ERROR", "Pacote contratual bloqueado por conferencia financeira pendente.", { pendingPaymentChecks });
  }
}

function sendStatusForProvider(provider: string) {
  if (provider === "CDT_DIGITAL") return "SENT_TO_CDT";
  if (provider === "E_NOTARIADO") return "SENT_TO_E_NOTARIADO";
  if (provider === "CARTORIO_FISICO") return "SENT_TO_CARTORIO_FISICO";
  if (provider === "GOV_BR") return "SENT_TO_GOV_BR";
  return "READY_FOR_SIGNATURE";
}

async function linkPackageAttachments(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    sale: SaleRecord;
    contractId: string | null;
    attachmentIds: string[];
    purpose: string;
  },
) {
  const targets = [
    { entityType: "sale", entityId: input.sale.id },
    input.contractId ? { entityType: "contract", entityId: input.contractId } : null,
    input.sale.vehicleId ? { entityType: "vehicle", entityId: input.sale.vehicleId } : null,
    input.sale.customerId ? { entityType: "customer", entityId: input.sale.customerId } : null,
  ].filter((item): item is { entityType: string; entityId: string } => Boolean(item));

  const links = input.attachmentIds.flatMap((attachmentId) =>
    targets.map((target) => ({
      storeId: input.storeId,
      attachmentId,
      entityType: target.entityType,
      entityId: target.entityId,
      purpose: input.purpose,
    })),
  );

  if (links.length > 0) {
    await tx.fileAttachmentLink.createMany({ data: links, skipDuplicates: true });
  }
}

async function linkInspectionReportAttachment(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    report: SaleInspectionReportRecord;
    attachmentId: string;
  },
) {
  const targets = [
    { entityType: "sale", entityId: input.report.saleId },
    { entityType: "vehicle", entityId: input.report.vehicleId },
    input.report.customerId ? { entityType: "customer", entityId: input.report.customerId } : null,
  ].filter((item): item is { entityType: string; entityId: string } => Boolean(item));

  await tx.fileAttachmentLink.createMany({
    data: targets.map((target) => ({
      storeId: input.storeId,
      attachmentId: input.attachmentId,
      entityType: target.entityType,
      entityId: target.entityId,
      purpose: input.report.reportType === "CAUTIONARY" ? "cautionary_report" : "transfer_report",
    })),
    skipDuplicates: true,
  });
}

async function loadInspectionReportForRead(storeId: string, reportId: string, user: { id: string; role: string }) {
  const report = await prisma.saleInspectionReport.findFirst({ where: { id: reportId, storeId } });
  if (!report) {
    throw new ApiError("NOT_FOUND", "Laudo da venda nao encontrado.");
  }

  if (user.role === "SELLER" || user.role === "SDR") {
    const sale = await prisma.sale.findFirst({ where: { id: report.saleId, storeId, deletedAt: null }, select: { sellerUserId: true } });
    if (!sale || sale.sellerUserId !== user.id) {
      throw new ApiError("NOT_FOUND", "Laudo da venda nao encontrado.");
    }
  }

  return report;
}

function assertReportWaiverAllowed(role: string, status: SaleInspectionReportStatus | undefined) {
  if (status !== "WAIVED") {
    return;
  }
  if (role === "OWNER_MANAGER" || role === "ADMIN") {
    return;
  }
  throw new ApiError("FORBIDDEN", "Dispensa de laudo obrigatorio exige gestor/administrador.");
}

export async function registerContractRoutes(app: FastifyInstance) {
  app.get("/", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const query = contractQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);

    const where = {
      storeId: session.user.storeId,
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.contract.findMany({ where, orderBy: { generatedAt: "desc" }, skip, take }),
      prisma.contract.count({ where }),
    ]);

    return listResponse(items.map(sanitizeContract), query, total);
  });

  app.get("/packages", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const query = packageQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);

    const where = {
      storeId: session.user.storeId,
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.signature_provider ? { signatureProvider: query.signature_provider } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.contractDocumentPackage.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      prisma.contractDocumentPackage.count({ where }),
    ]);

    return listResponse(items.map(sanitizeContractPackage), query, total);
  });

  app.get("/packages/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = packageParamsSchema.parse(request.params);
    const item = await getContractPackageOrThrow(session.user.storeId, params.id);

    return { data: sanitizeContractPackage(item) };
  });

  app.post("/packages", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const input = createContractPackageSchema.parse(request.body);
    const sale = await getSaleOrThrow(session.user.storeId, input.saleId);
    ensureSaleLinksReadyForContractPackage(sale);
    await ensureContractBelongsToSale(session.user.storeId, input.contractId, sale.id);
    await ensureAttachmentInStore(session.user.storeId, input.generatedFileId);

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.contractDocumentPackage.create({
        data: {
          storeId: session.user.storeId,
          saleId: sale.id,
          contractId: input.contractId,
          documentType: input.documentType,
          status: input.status,
          generatedFileId: input.generatedFileId,
          signatureProvider: input.signatureProvider,
          vehicleTransferMode: input.vehicleTransferMode,
          govbrLevelRequired: input.govbrLevelRequired,
          vehicleDocumentEligibleForAtpve: input.vehicleDocumentEligibleForAtpve,
          reviewNotes: input.reviewNotes,
          guidance: signatureGuidance(input.signatureProvider, input.vehicleTransferMode) as Prisma.InputJsonObject,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "contract_package_created",
          entityType: "contract_document_package",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            saleId: created.saleId,
            contractId: created.contractId,
            signatureProvider: created.signatureProvider,
            vehicleTransferMode: created.vehicleTransferMode,
          },
        },
      });

      return created;
    });

    return reply.code(201).send({ data: sanitizeContractPackage(item) });
  });

  app.post("/packages/:id/review", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = packageParamsSchema.parse(request.params);
    const input = reviewContractPackageSchema.parse(request.body);
    const current = await getContractPackageOrThrow(session.user.storeId, params.id);
    const now = new Date();

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.contractDocumentPackage.update({
        where: { id: current.id },
        data: {
          status: "READY_FOR_SIGNATURE",
          observationsReviewed: input.observationsReviewed,
          reviewedByUserId: session.user.id,
          reviewedAt: now,
          reviewNotes: input.reviewNotes,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "contract_package_reviewed",
          entityType: "contract_document_package",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { saleId: updated.saleId, reviewedAt: now.toISOString() },
        },
      });

      return updated;
    });

    return { data: sanitizeContractPackage(item) };
  });

  app.post("/packages/:id/send-signature", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = packageParamsSchema.parse(request.params);
    const input = sendContractPackageSchema.parse(request.body);
    const current = await getContractPackageOrThrow(session.user.storeId, params.id);
    const sale = await getSaleOrThrow(session.user.storeId, current.saleId);
    ensureSaleLinksReadyForContractPackage(sale);

    if (!current.observationsReviewed) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Revise as observacoes do contrato antes do envio para assinatura.", {
        missing: ["observations_reviewed"],
      });
    }
    if (input.vehicleTransferMode === "NOT_DEFINED") {
      throw new ApiError("BUSINESS_RULE_ERROR", "Defina a modalidade de transferencia antes do envio para assinatura.", {
        missing: ["vehicle_transfer_mode"],
      });
    }
    if (input.signatureProvider === "CDT_DIGITAL" && input.vehicleDocumentEligibleForAtpve === false) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Venda Digital/CDT bloqueada: documento do veiculo nao esta marcado como elegivel para ATPV-e.", {
        missing: ["vehicle_document_eligible_for_atpve"],
      });
    }

    await ensureBuyerDocumentsReadyForContract(session.user.storeId, sale);
    await ensureInspectionReportsReadyForSale(session.user.storeId, sale.id);
    const currentMetadata = typeof current.metadata === "object" && current.metadata ? current.metadata : {};
    const requirePaymentBeforeSignature = Boolean(
      input.metadata?.requirePaymentBeforeSignature ?? (currentMetadata as Record<string, unknown>).requirePaymentBeforeSignature,
    );
    if (requirePaymentBeforeSignature) {
      await ensurePaymentReadyForContractPackage(session.user.storeId, sale.id);
    }

    const now = new Date();
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.contractDocumentPackage.update({
        where: { id: current.id },
        data: {
          status: sendStatusForProvider(input.signatureProvider),
          signatureProvider: input.signatureProvider,
          vehicleTransferMode: input.vehicleTransferMode,
          govbrLevelRequired: input.govbrLevelRequired ?? (input.signatureProvider === "CDT_DIGITAL" ? "PRATA_OURO" : current.govbrLevelRequired),
          vehicleDocumentEligibleForAtpve: input.vehicleDocumentEligibleForAtpve,
          sellerSignatureStatus: "AWAITING",
          buyerSignatureStatus: "AWAITING",
          atpveStatus: input.signatureProvider === "CDT_DIGITAL" || input.vehicleTransferMode === "CDT_DIGITAL" ? "SENT" : current.atpveStatus,
          sentAt: now,
          buyerNotifiedAt: input.buyerNotificationChannel === "NONE" ? null : now,
          buyerNotificationChannel: input.buyerNotificationChannel,
          buyerNotificationRecipient: input.buyerNotificationRecipient,
          guidance: signatureGuidance(input.signatureProvider, input.vehicleTransferMode) as Prisma.InputJsonObject,
          metadata: input.metadata as Prisma.InputJsonObject | undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "contract_package_sent_for_signature",
          entityType: "contract_document_package",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            saleId: updated.saleId,
            contractId: updated.contractId,
            signatureProvider: updated.signatureProvider,
            vehicleTransferMode: updated.vehicleTransferMode,
            buyerNotificationChannel: updated.buyerNotificationChannel,
          },
        },
      });

      return updated;
    });

    return { data: sanitizeContractPackage(item) };
  });

  app.post("/packages/:id/signed-document", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = packageParamsSchema.parse(request.params);
    const input = registerSignedPackageSchema.parse(request.body);
    const current = await getContractPackageOrThrow(session.user.storeId, params.id);
    const sale = await getSaleOrThrow(session.user.storeId, current.saleId);

    await ensureAttachmentInStore(session.user.storeId, input.signedFileId);
    await ensureAttachmentInStore(session.user.storeId, input.atpveFileId);
    await ensureAttachmentInStore(session.user.storeId, input.atpveEvidenceFileId);

    const fullySigned = input.sellerSignatureStatus === "SIGNED" && input.buyerSignatureStatus === "SIGNED";
    const signedAt = input.signedAt ?? new Date();
    const attachmentIds = [input.signedFileId, input.atpveFileId, input.atpveEvidenceFileId].filter((id): id is string => Boolean(id));

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.contractDocumentPackage.update({
        where: { id: current.id },
        data: {
          status: fullySigned ? "SIGNED_ALL" : "PARTIALLY_SIGNED",
          signedFileId: input.signedFileId,
          atpveFileId: input.atpveFileId === undefined ? undefined : input.atpveFileId,
          atpveEvidenceFileId: input.atpveEvidenceFileId === undefined ? undefined : input.atpveEvidenceFileId,
          sellerSignatureStatus: input.sellerSignatureStatus,
          buyerSignatureStatus: input.buyerSignatureStatus,
          atpveStatus: input.atpveStatus,
          signedAt: fullySigned ? signedAt : current.signedAt,
          signatureHash: input.signatureHash,
          metadata: {
            ...(typeof current.metadata === "object" && current.metadata ? current.metadata : {}),
            signedDocumentNotes: input.notes ?? null,
          },
        },
      });

      if (current.contractId && fullySigned) {
        await tx.contract.update({
          where: { id: current.contractId },
          data: { status: "SIGNED", signedAt },
        });
      }

      await linkPackageAttachments(tx, {
        storeId: session.user.storeId,
        sale,
        contractId: current.contractId,
        attachmentIds,
        purpose: "contract_package_signed_document",
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "contract_package_signed_document_registered",
          entityType: "contract_document_package",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            saleId: updated.saleId,
            contractId: updated.contractId,
            signedFileId: updated.signedFileId,
            atpveFileId: updated.atpveFileId,
            atpveEvidenceFileId: updated.atpveEvidenceFileId,
            sellerSignatureStatus: updated.sellerSignatureStatus,
            buyerSignatureStatus: updated.buyerSignatureStatus,
            atpveStatus: updated.atpveStatus,
          },
        },
      });

      return updated;
    });

    if (current.contractId && fullySigned) {
      await emitInternalEvent({
        name: "contract.signed",
        storeId: session.user.storeId,
        actorId: session.user.id,
        entityType: "contract",
        entityId: current.contractId,
        payload: { saleId: current.saleId, signedAt: signedAt.toISOString(), source: "contract_package" },
      });
    }

    return { data: sanitizeContractPackage(item) };
  });

  app.get("/inspection-reports", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const query = inspectionReportQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where = {
      storeId: session.user.storeId,
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
      ...(query.vehicle_id ? { vehicleId: query.vehicle_id } : {}),
      ...(query.report_type ? { reportType: query.report_type } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [items, total, allForSummary] = await Promise.all([
      prisma.saleInspectionReport.findMany({ where, orderBy: [{ reportType: "asc" }, { createdAt: "desc" }], skip, take }),
      prisma.saleInspectionReport.count({ where }),
      prisma.saleInspectionReport.findMany({ where }),
    ]);

    return {
      ...listResponse(items.map(sanitizeInspectionReport), query, total),
      summary: summarizeSaleInspectionReports(allForSummary),
    };
  });

  app.get("/inspection-reports/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = inspectionReportParamsSchema.parse(request.params);
    const report = await loadInspectionReportForRead(session.user.storeId, params.id, session.user);
    return { data: sanitizeInspectionReport(report) };
  });

  app.patch("/inspection-reports/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = inspectionReportParamsSchema.parse(request.params);
    const input = updateInspectionReportSchema.parse(request.body);
    const current = await prisma.saleInspectionReport.findFirst({ where: { id: params.id, storeId: session.user.storeId } });
    if (!current) {
      throw new ApiError("NOT_FOUND", "Laudo da venda nao encontrado.");
    }

    assertReportWaiverAllowed(session.user.role, input.status as SaleInspectionReportStatus | undefined);
    await ensureAttachmentInStore(session.user.storeId, input.reportFileId);
    await ensureServiceProviderInStore(session.user.storeId, input.serviceProviderId);

    if (input.reportFileId && current.reportFileId && input.reportFileId !== current.reportFileId && !input.replacementReason) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Substituicao de laudo exige justificativa.", { missing: ["replacement_reason"] });
    }

    const explicitStatus = input.status as SaleInspectionReportStatus | undefined;
    const nextReportFileId = input.reportFileId === undefined ? current.reportFileId : input.reportFileId;
    const nextStatus = explicitStatus ?? (input.reportFileId ? "ATTACHED" : (current.status as SaleInspectionReportStatus));
    if (nextStatus === "CHECKED" && !nextReportFileId) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Laudo conferido exige arquivo anexado.", { missing: ["report_file_id"] });
    }

    const now = new Date();
    const reportDate = input.reportDate === undefined ? current.reportDate : input.reportDate;
    const retentionUntil =
      current.reportType === "CAUTIONARY" && (input.reportFileId || input.reportDate)
        ? new Date((reportDate ?? now).getTime() + 730 * 24 * 60 * 60 * 1000)
        : undefined;

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.saleInspectionReport.update({
        where: { id: current.id },
        data: {
          status: nextStatus,
          reportFileId: input.reportFileId === undefined ? undefined : input.reportFileId,
          reportDate: input.reportDate === undefined ? undefined : input.reportDate,
          attachedByUserId: input.reportFileId ? session.user.id : undefined,
          attachedAt: input.reportFileId ? now : undefined,
          checkedByUserId: nextStatus === "CHECKED" ? session.user.id : nextStatus === "WAIVED" ? session.user.id : undefined,
          checkedAt: nextStatus === "CHECKED" || nextStatus === "WAIVED" ? now : undefined,
          serviceProviderId: input.serviceProviderId === undefined ? undefined : input.serviceProviderId,
          requestedByCustomer: input.requestedByCustomer,
          retentionUntil,
          deleteAfterRetentionStatus: retentionUntil ? "PENDING_POLICY_REVIEW" : undefined,
          replacementReason: input.replacementReason === undefined ? undefined : input.replacementReason,
          rejectionReason: input.rejectionReason === undefined ? undefined : input.rejectionReason,
          waiverReason: input.waiverReason === undefined ? undefined : input.waiverReason,
          notes: input.notes === undefined ? undefined : input.notes,
        },
      });

      if (input.reportFileId) {
        await linkInspectionReportAttachment(tx, { storeId: session.user.storeId, report: next, attachmentId: input.reportFileId });
      }

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "sale_inspection_report_updated",
          entityType: "sale_inspection_report",
          entityId: next.id,
          result: "SUCCESS",
          metadata: {
            saleId: next.saleId,
            vehicleId: next.vehicleId,
            reportType: next.reportType,
            fromStatus: current.status,
            toStatus: next.status,
            reportFileId: next.reportFileId,
          },
        },
      });

      return next;
    });

    const saleReports = await prisma.saleInspectionReport.findMany({ where: { storeId: session.user.storeId, saleId: updated.saleId } });
    return { data: sanitizeInspectionReport(updated), summary: summarizeSaleInspectionReports(saleReports) };
  });

  app.post("/inspection-reports/:id/export", async (request) => {
    const session = await requirePermission(request, {
      module: "sales",
      action: "read",
      scope: "STORE",
      sensitiveArea: "general",
    });
    const params = inspectionReportParamsSchema.parse(request.params);
    const input = exportInspectionReportSchema.parse(request.body);
    const report = await loadInspectionReportForRead(session.user.storeId, params.id, session.user);
    if (!report.reportFileId) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Laudo ainda nao possui arquivo para visualizacao/exportacao/impressao.", { reportType: report.reportType });
    }

    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.saleInspectionReport.update({
        where: { id: report.id },
        data: {
          requestedByCustomer: input.requestedByCustomer ? true : undefined,
          printedAt: input.action === "PRINT" ? now : undefined,
          printedByUserId: input.action === "PRINT" ? session.user.id : undefined,
          exportedAt: input.action === "DOWNLOAD" || input.action === "VIEW" ? now : undefined,
          exportedByUserId: input.action === "DOWNLOAD" || input.action === "VIEW" ? session.user.id : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: input.action === "PRINT" ? "sale_inspection_report_printed" : "sale_inspection_report_exported",
          entityType: "sale_inspection_report",
          entityId: next.id,
          result: "SUCCESS",
          metadata: {
            saleId: next.saleId,
            vehicleId: next.vehicleId,
            reportType: next.reportType,
            action: input.action,
            requestedByCustomer: input.requestedByCustomer,
            notes: input.notes ?? null,
          },
        },
      });

      return next;
    });

    return {
      data: {
        report: sanitizeInspectionReport(updated),
        action: input.action,
        attachmentId: updated.reportFileId,
        signedDownloadUrl: null,
        auditLoggedAt: now.toISOString(),
      },
    };
  });
  app.get("/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = contractParamsSchema.parse(request.params);
    const contract = await getContractOrThrow(session.user.storeId, params.id);

    return { data: sanitizeContract(contract) };
  });

  app.post("/generate", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const input = generateContractSchema.parse(request.body);
    const sale = await getSaleOrThrow(session.user.storeId, input.saleId);
    await ensureBuyerDocumentsReadyForContract(session.user.storeId, sale);
    const currentVersion = await prisma.contract.count({
      where: { storeId: session.user.storeId, saleId: sale.id },
    });
    const snapshot = await buildSaleSnapshot(session.user.storeId, sale.id, input.snapshot);

    const contract = await prisma.$transaction(async (tx) => {
      const created = await tx.contract.create({
        data: {
          storeId: session.user.storeId,
          saleId: sale.id,
          templateId: input.templateId,
          version: currentVersion + 1,
          status: input.status,
          snapshot: snapshot as Prisma.InputJsonObject,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "contract_generated",
          entityType: "contract",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            saleId: sale.id,
            version: created.version,
            status: created.status,
          },
        },
      });

      return created;
    });

    const warrantyTerm = await prisma.$transaction((tx) =>
      createWarrantyTermDocument(tx, {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        saleId: sale.id,
        sourceContractId: contract.id,
        templateId: input.templateId,
        terms: undefined,
        action: "warranty_term_auto_generated",
      }),
    );
    await emitInternalEvent({
      name: "contract.generated",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "contract",
      entityId: contract.id,
      payload: { saleId: sale.id, version: contract.version, status: contract.status, warrantyTermId: warrantyTerm.id },
    });

    return reply.code(201).send({ data: sanitizeContract(contract), warrantyTerm: sanitizeWarrantyTerm(warrantyTerm) });
  });

  app.post("/:id/sign", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = contractParamsSchema.parse(request.params);
    const input = signContractSchema.parse(request.body);
    const current = await getContractOrThrow(session.user.storeId, params.id);

    const contract = await prisma.$transaction(async (tx) => {
      const updated = await tx.contract.update({
        where: { id: current.id },
        data: {
          status: "SIGNED",
          signedAt: input.signedAt ?? new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "contract_signed",
          entityType: "contract",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: {
            saleId: updated.saleId,
            reason: input.reason,
          },
        },
      });

      return updated;
    });

    await emitInternalEvent({
      name: "contract.signed",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "contract",
      entityId: contract.id,
      payload: { saleId: contract.saleId, signedAt: contract.signedAt?.toISOString() ?? null },
    });

    return { data: sanitizeContract(contract) };
  });

  app.get("/warranty-terms", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const query = warrantyTermQuerySchema.parse(request.query);
    const { skip, take } = getPagination(query);
    const where: Prisma.WarrantyTermWhereInput = {
      storeId: session.user.storeId,
      ...(query.sale_id ? { saleId: query.sale_id } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.signed_status ? { signedStatus: query.signed_status } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.warrantyTerm.findMany({ where, orderBy: [{ generatedAt: "desc" }, { createdAt: "desc" }], skip, take }),
      prisma.warrantyTerm.count({ where }),
    ]);

    return listResponse(items.map(sanitizeWarrantyTerm), query, total);
  });

  app.get("/warranty-terms/:id", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = warrantyTermParamsSchema.parse(request.params);
    const warranty = await getWarrantyTermOrThrow(session.user.storeId, params.id);

    return { data: sanitizeWarrantyTerm(warranty) };
  });

  app.get("/warranty-terms/:id/document", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = warrantyTermParamsSchema.parse(request.params);
    const query = warrantyTermDocumentQuerySchema.parse(request.query);
    const warranty = await getWarrantyTermOrThrow(session.user.storeId, params.id);
    const version = warranty.generatedFileId
      ? await prisma.documentVersion.findFirst({ where: { storeId: session.user.storeId, attachmentId: warranty.generatedFileId }, orderBy: { version: "desc" } })
      : null;
    const versionSnapshot = version?.snapshot as { document?: unknown; html?: unknown } | null | undefined;
    const documentSnapshot = (versionSnapshot?.document ?? warranty.snapshot ?? {}) as Record<string, unknown>;
    const html = typeof versionSnapshot?.html === "string" ? versionSnapshot.html : renderWarrantyTermHtml(documentSnapshot);

    if (query.format === "html") {
      return reply.type("text/html; charset=utf-8").send(html);
    }

    return { data: { warrantyTerm: sanitizeWarrantyTerm(warranty), document: documentSnapshot, html } };
  });

  app.post("/warranty-terms", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const input = warrantyTermSchema.parse(request.body);
    const warranty = await prisma.$transaction((tx) =>
      createWarrantyTermDocument(tx, {
        storeId: session.user.storeId,
        actorId: session.user.id,
        actorRole: session.user.role,
        saleId: input.saleId,
        sourceContractId: input.sourceContractId,
        templateId: input.templateId,
        terms: input.terms,
        action: "warranty_term_created",
      }),
    );

    return reply.code(201).send({
      data: sanitizeWarrantyTerm(warranty),
      print: { printableDocumentUrl: `/contracts/warranty-terms/${warranty.id}/document?format=html` },
    });
  });

  app.post("/warranty-terms/:id/print", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = warrantyTermParamsSchema.parse(request.params);
    const input = printWarrantyTermSchema.parse(request.body);
    const current = await getWarrantyTermOrThrow(session.user.storeId, params.id);
    if (!current.generatedFileId) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Termo de garantia ainda nao possui arquivo gerado.");
    }
    if (current.printedAt && !input.reason) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Informe motivo para reimpressao do termo de garantia.");
    }
    const now = new Date();
    const alreadyPrinted = Boolean(current.printedAt);
    const action = alreadyPrinted ? "warranty_term_reprinted" : "warranty_term_printed";
    const warranty = await prisma.$transaction(async (tx) => {
      const updated = await tx.warrantyTerm.update({
        where: { id: current.id },
        data: {
          status: alreadyPrinted ? "REPRINTED" : "PRINTED",
          printedAt: alreadyPrinted ? current.printedAt : now,
          printedByUserId: alreadyPrinted ? current.printedByUserId : session.user.id,
          reprintCount: alreadyPrinted ? { increment: 1 } : current.reprintCount,
          lastReprintAt: alreadyPrinted ? now : current.lastReprintAt,
        },
      });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action,
          entityType: "warranty_term",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { saleId: updated.saleId, reason: input.reason ?? null, printerConfigured: input.printerConfigured },
        },
      });
      return updated;
    });

    return {
      data: sanitizeWarrantyTerm(warranty),
      print: { printableDocumentUrl: `/contracts/warranty-terms/${warranty.id}/document?format=html`, action, printerConfigured: input.printerConfigured },
    };
  });

  app.post("/warranty-terms/:id/confirm-signature", async (request) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const params = warrantyTermParamsSchema.parse(request.params);
    const input = confirmWarrantySignatureSchema.parse(request.body);
    const current = await getWarrantyTermOrThrow(session.user.storeId, params.id);
    if (input.signedStatus === "WAIVED" && !["OWNER_MANAGER", "ADMIN"].includes(session.user.role)) {
      throw new ApiError("FORBIDDEN", "Somente gestor/admin pode dispensar assinatura fisica do termo de garantia.");
    }
    const now = new Date();
    const allDocumentsSignedStatus = input.allDocumentsSignedStatus ?? (input.signedStatus === "SIGNED" ? "ALL_SIGNED" : "PARTIALLY_SIGNED");
    const warranty = await prisma.$transaction(async (tx) => {
      const updated = await tx.warrantyTerm.update({
        where: { id: current.id },
        data: {
          status: input.signedStatus === "SIGNED" ? "SIGNED" : "WAIVED",
          signedStatus: input.signedStatus,
          signedConfirmedAt: now,
          signedConfirmedByUserId: session.user.id,
          signatureObservation: input.observation,
          allDocumentsSignedStatus,
        },
      });
      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "warranty_term_signature_confirmed",
          entityType: "warranty_term",
          entityId: updated.id,
          result: "SUCCESS",
          metadata: { saleId: updated.saleId, signedStatus: updated.signedStatus, allDocumentsSignedStatus: updated.allDocumentsSignedStatus },
        },
      });
      return updated;
    });

    return { data: sanitizeWarrantyTerm(warranty), summary: await buildSaleSignatureSummary(session.user.storeId, warranty.saleId) };
  });

  app.get("/sales/:saleId/signature-summary", async (request) => {
    const session = await requirePermission(request, { module: "sales", action: "read", scope: "STORE", sensitiveArea: "general" });
    const params = saleSignatureSummaryParamsSchema.parse(request.params);
    const sale = await prisma.sale.findFirst({
      where: {
        id: params.saleId,
        storeId: session.user.storeId,
        deletedAt: null,
        ...(isCommercialFullView(session.user.role) ? {} : { sellerUserId: session.user.id }),
      },
      select: { id: true },
    });
    if (!sale) {
      throw new ApiError("NOT_FOUND", "Processo de vendas nao encontrado.");
    }

    return { data: await buildSaleSignatureSummary(session.user.storeId, sale.id) };
  });
  app.post("/delivery-checklists", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const input = deliveryChecklistSchema.parse(request.body);
    await getSaleOrThrow(session.user.storeId, input.saleId);

    const checklist = await prisma.$transaction(async (tx) => {
      const created = await tx.deliveryChecklist.create({
        data: {
          storeId: session.user.storeId,
          saleId: input.saleId,
          checklist: input.checklist as Prisma.InputJsonObject,
          status: input.status,
          deliveredAt: input.deliveredAt,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "delivery_checklist_created",
          entityType: "delivery_checklist",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            saleId: created.saleId,
            status: created.status,
          },
        },
      });

      return created;
    });

    return reply.code(201).send({
      data: {
        id: checklist.id,
        saleId: checklist.saleId,
        checklist: checklist.checklist,
        status: checklist.status,
        deliveredAt: checklist.deliveredAt?.toISOString() ?? null,
        createdAt: checklist.createdAt.toISOString(),
        updatedAt: checklist.updatedAt.toISOString(),
      },
    });
  });
}
