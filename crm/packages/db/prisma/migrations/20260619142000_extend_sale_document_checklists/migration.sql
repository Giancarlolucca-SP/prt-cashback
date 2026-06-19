ALTER TABLE "sale_document_checklists"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "is_required" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "attachment_id" TEXT,
ADD COLUMN "issue_date" TIMESTAMP(3),
ADD COLUMN "valid_until" TIMESTAMP(3),
ADD COLUMN "checked_at" TIMESTAMP(3),
ADD COLUMN "checked_by_user_id" TEXT,
ADD COLUMN "responsible_user_id" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "rejection_reason" TEXT,
ADD COLUMN "waived_reason" TEXT,
ADD COLUMN "metadata" JSONB;

UPDATE "sale_document_checklists"
SET "status" = 'CHECKED',
    "checked_at" = COALESCE("completed_at", "updated_at")
WHERE "is_done" = true;

CREATE INDEX "sale_document_checklists_store_id_sale_id_status_idx"
ON "sale_document_checklists"("store_id", "sale_id", "status");

CREATE INDEX "sale_document_checklists_attachment_id_idx"
ON "sale_document_checklists"("attachment_id");
