-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "last_interaction_result" TEXT,
ADD COLUMN     "last_interaction_type" TEXT,
ADD COLUMN     "next_action_type" TEXT;

-- CreateTable
CREATE TABLE "commercial_interactions" (
    "id" TEXT NOT NULL,
    "store_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "lead_id" TEXT,
    "customer_id" TEXT,
    "vehicle_id" TEXT,
    "vehicle_interest" JSONB,
    "responsible_user_id" TEXT NOT NULL,
    "interaction_type" TEXT NOT NULL,
    "channel" TEXT,
    "result" TEXT,
    "notes" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_action_type" TEXT,
    "next_action_at" TIMESTAMP(3),
    "next_action_owner_id" TEXT,
    "next_action_status" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "commercial_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "commercial_interactions_store_id_occurred_at_idx" ON "commercial_interactions"("store_id", "occurred_at");

-- CreateIndex
CREATE INDEX "commercial_interactions_card_id_idx" ON "commercial_interactions"("card_id");

-- CreateIndex
CREATE INDEX "commercial_interactions_lead_id_idx" ON "commercial_interactions"("lead_id");

-- CreateIndex
CREATE INDEX "commercial_interactions_responsible_user_id_idx" ON "commercial_interactions"("responsible_user_id");

-- CreateIndex
CREATE INDEX "commercial_interactions_store_id_next_action_at_idx" ON "commercial_interactions"("store_id", "next_action_at");

-- AddForeignKey
ALTER TABLE "commercial_interactions" ADD CONSTRAINT "commercial_interactions_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "lead_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
