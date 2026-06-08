import { randomUUID } from "node:crypto";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requirePermission } from "../api/auth-guards.js";
import { ApiError } from "../api/errors.js";
import { canUser } from "../auth/rbac.js";
import { createStorageAdapter } from "../adapters/index.js";
import { emitInternalEvent } from "../events/internal-events.js";
import { prisma } from "../lib/db.js";

const allowedBuckets = [
  "customer-documents",
  "vehicle-documents",
  "sale-documents",
  "service-documents",
  "listing-media",
  "system-generated",
] as const;

const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"] as const;

const prepareUploadSchema = z.object({
  bucket: z.enum(allowedBuckets),
  originalName: z.string().trim().min(1).max(180),
  mimeType: z.enum(allowedMimeTypes),
  sizeBytes: z.coerce.number().int().positive().max(30 * 1024 * 1024),
  checksum: z.string().trim().max(160).optional(),
  classification: z.string().trim().min(2).max(80),
  link: z.object({
    entityType: z.string().trim().min(2).max(80),
    entityId: z.string().uuid(),
    purpose: z.string().trim().min(2).max(80).optional(),
  }),
});

const deleteCustomerDocumentSchema = z.object({
  reason: z.string().trim().min(6).max(500),
});

const attachmentParamsSchema = z.object({
  id: z.string().uuid(),
});

const retainedEntityTypes = new Set(["sale", "contract", "financial_entry", "invoice", "audit_log"]);
const sensitiveClassifications = new Set([
  "financial",
  "provider_invoice",
  "vehicle_cost",
  "margin",
  "tax",
  "bank_reconciliation",
]);

function safeFilename(originalName: string) {
  const parsed = path.parse(originalName);
  const name = parsed.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  const ext = parsed.ext.toLowerCase().replace(/[^a-z0-9.]/g, "");

  return `${name || "arquivo"}${ext}`;
}

function buildStoragePath(input: {
  storeId: string;
  entityType: string;
  entityId: string;
  originalName: string;
}) {
  return `${input.storeId}/${input.entityType}/${input.entityId}/${randomUUID()}-${safeFilename(input.originalName)}`;
}

async function ensureAttachmentAccess(input: {
  user: Awaited<ReturnType<typeof requireAuth>>["user"];
  attachmentId: string;
  action: "download" | "delete";
}) {
  const attachment = await prisma.fileAttachment.findFirst({
    where: {
      id: input.attachmentId,
      storeId: input.user.storeId,
      status: "ACTIVE",
      deletedAt: null,
    },
  });

  if (!attachment) {
    throw new ApiError("NOT_FOUND", "Arquivo nao encontrado.");
  }

  const baseDecision = await canUser(input.user, {
    module: "documents",
    action: "manage",
    scope: "STORE",
    sensitiveArea: "documents",
  });

  if (!baseDecision.allowed) {
    throw new ApiError("FORBIDDEN", "Usuario sem permissao para documentos.", { reason: baseDecision.reason });
  }

  if (attachment.classification && sensitiveClassifications.has(attachment.classification)) {
    const financeDecision = await canUser(input.user, {
      module: "finance",
      action: "manage",
      scope: "ALL",
      sensitiveArea: "financial",
    });

    if (!financeDecision.allowed) {
      throw new ApiError("FORBIDDEN", "Documento sensivel restrito.", { reason: financeDecision.reason });
    }
  }

  return attachment;
}

export async function registerFileRoutes(app: FastifyInstance) {
  app.post("/prepare-upload", async (request, reply) => {
    const session = await requirePermission(request, {
      module: "documents",
      action: "manage",
      scope: "STORE",
      sensitiveArea: "documents",
    });
    const input = prepareUploadSchema.parse(request.body);
    const storagePath = buildStoragePath({
      storeId: session.user.storeId,
      entityType: input.link.entityType,
      entityId: input.link.entityId,
      originalName: input.originalName,
    });

    const attachment = await prisma.$transaction(async (tx) => {
      const created = await tx.fileAttachment.create({
        data: {
          storeId: session.user.storeId,
          bucket: input.bucket,
          path: storagePath,
          originalName: input.originalName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          checksum: input.checksum,
          classification: input.classification,
          uploadedByUserId: session.user.id,
        },
      });

      await tx.fileAttachmentLink.create({
        data: {
          storeId: session.user.storeId,
          attachmentId: created.id,
          entityType: input.link.entityType,
          entityId: input.link.entityId,
          purpose: input.link.purpose,
        },
      });

      await tx.documentVersion.create({
        data: {
          storeId: session.user.storeId,
          attachmentId: created.id,
          version: 1,
          snapshot: {
            bucket: created.bucket,
            path: created.path,
            originalName: created.originalName,
            classification: created.classification,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "prepare_upload",
          entityType: "file_attachment",
          entityId: created.id,
          result: "SUCCESS",
          metadata: {
            bucket: created.bucket,
            path: created.path,
            classification: created.classification,
            linkedEntityType: input.link.entityType,
            linkedEntityId: input.link.entityId,
          },
        },
      });

      return created;
    });

    await emitInternalEvent({
      name: "document.uploaded",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "file_attachment",
      entityId: attachment.id,
      payload: {
        bucket: attachment.bucket,
        classification: attachment.classification,
        metadataOnly: true,
      },
    });

    return reply.code(201).send({
      data: {
        id: attachment.id,
        bucket: attachment.bucket,
        path: attachment.path,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        classification: attachment.classification,
        status: attachment.status,
      },
      upload: {
        mode: "supabase-private-upload",
        bucket: attachment.bucket,
        path: attachment.path,
        signedUploadUrl: null,
        metadataPersisted: true,
      },
    });
  });

  app.get("/:id/download", async (request) => {
    const session = await requireAuth(request);
    const params = attachmentParamsSchema.parse(request.params);
    const attachment = await ensureAttachmentAccess({
      user: session.user,
      attachmentId: params.id,
      action: "download",
    });

    const storage = createStorageAdapter();
    const signed = await storage.createSignedDownloadUrl({
      bucket: attachment.bucket,
      path: attachment.path,
      expiresInSeconds: 300,
    });

    if (!signed.ok || !signed.data) {
      throw new ApiError("EXTERNAL_SERVICE_ERROR", "Falha ao gerar link temporario do arquivo.", signed.error);
    }

    await prisma.documentAccessLog.create({
      data: {
        storeId: session.user.storeId,
        attachmentId: attachment.id,
        actorUserId: session.user.id,
        action: "download_signed_url",
      },
    });

    return {
      data: {
        id: attachment.id,
        bucket: attachment.bucket,
        originalName: attachment.originalName,
        url: signed.data.url,
        expiresAt: signed.data.expiresAt,
      },
    };
  });

  app.post("/:id/delete-customer-document", async (request) => {
    const session = await requireAuth(request);
    const params = attachmentParamsSchema.parse(request.params);
    const input = deleteCustomerDocumentSchema.parse(request.body);
    const attachment = await ensureAttachmentAccess({
      user: session.user,
      attachmentId: params.id,
      action: "delete",
    });

    const links = await prisma.fileAttachmentLink.findMany({
      where: {
        attachmentId: attachment.id,
        storeId: session.user.storeId,
      },
    });
    const hasCustomerLink = links.some((link) => link.entityType === "customer");
    const hasRetainedLink = links.some((link) => retainedEntityTypes.has(link.entityType));

    if (!hasCustomerLink) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Somente documento vinculado a cliente pode usar este fluxo de exclusao.");
    }

    if (hasRetainedLink) {
      throw new ApiError("BUSINESS_RULE_ERROR", "Documento possui vinculo com processo de retencao obrigatoria.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.fileAttachment.update({
        where: { id: attachment.id },
        data: {
          status: "DELETED",
          deletedAt: new Date(),
        },
      });

      await tx.documentAccessLog.create({
        data: {
          storeId: session.user.storeId,
          attachmentId: attachment.id,
          actorUserId: session.user.id,
          action: "delete_customer_document",
          reason: input.reason,
        },
      });

      await tx.auditLog.create({
        data: {
          storeId: session.user.storeId,
          actorId: session.user.id,
          actorRole: session.user.role,
          module: "documents",
          action: "delete_customer_document",
          entityType: "file_attachment",
          entityId: attachment.id,
          result: "SUCCESS",
          metadata: {
            reason: input.reason,
            bucket: attachment.bucket,
            path: attachment.path,
          },
        },
      });
    });

    await emitInternalEvent({
      name: "document.deleted",
      storeId: session.user.storeId,
      actorId: session.user.id,
      entityType: "file_attachment",
      entityId: attachment.id,
      payload: {
        reason: input.reason,
        physicalDeletionPending: true,
      },
    });

    return { ok: true };
  });
}
