ALTER TABLE "notifications"
ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'NEW',
ADD COLUMN "source_module" TEXT,
ADD COLUMN "action_url" TEXT,
ADD COLUMN "due_at" TIMESTAMP(3),
ADD COLUMN "resolved_at" TIMESTAMP(3),
ADD COLUMN "resolved_by_user_id" TEXT,
ADD COLUMN "dismissed_at" TIMESTAMP(3),
ADD COLUMN "dismissed_by_user_id" TEXT,
ADD COLUMN "dismissed_reason" TEXT,
ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "notifications_store_id_status_idx" ON "notifications"("store_id", "status");
CREATE INDEX "notifications_store_id_priority_idx" ON "notifications"("store_id", "priority");
