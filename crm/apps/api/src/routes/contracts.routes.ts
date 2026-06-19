import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../api/errors.js";
import { requirePermission } from "../api/auth-guards.js";
import { getPagination, listResponse } from "../api/pagination.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";
import { isAddressProofExpired, isAddressProofItem } from "../services/sale-document-checklist.js";
import { PAYMENT_RELEASED_STATUS } from "../services/sale-payment-check.js";

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

const contractParamsSchema = z.object({
  id: z.string().uuid(),
});

const signContractSchema = z.object({
  signedAt: z.coerce.date().optional(),
  reason: z.string().trim().max(300).optional(),
});

const warrantyTermSchema = z.object({
  saleId: z.string().uuid(),
  terms: z.record(z.unknown()),
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
type SaleRecord = Prisma.SaleGetPayload<Record<string, never>>;

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

    await emitInternalEvent({
      name: "contract.generated",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "contract",
      entityId: contract.id,
      payload: { saleId: sale.id, version: contract.version, status: contract.status },
    });

    return reply.code(201).send({ data: sanitizeContract(contract) });
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

  app.post("/warranty-terms", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const input = warrantyTermSchema.parse(request.body);
    await getSaleOrThrow(session.user.storeId, input.saleId);

    const warranty = await prisma.$transaction(async (tx) => {
      const created = await tx.warrantyTerm.create({
        data: {
          storeId: session.user.storeId,
          saleId: input.saleId,
          terms: input.terms as Prisma.InputJsonObject,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "warranty_term_created",
          entityType: "warranty_term",
          entityId: created.id,
          result: "SUCCESS",
          metadata: { saleId: created.saleId },
        },
      });

      return created;
    });

    return reply.code(201).send({
      data: {
        id: warranty.id,
        saleId: warranty.saleId,
        terms: warranty.terms,
        createdAt: warranty.createdAt.toISOString(),
      },
    });
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
