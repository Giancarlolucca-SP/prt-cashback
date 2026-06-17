-- DropIndex
DROP INDEX "repasse_revenues_repasse_process_id_idx";

-- AlterTable
ALTER TABLE "lead_cards" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "lost_reason" TEXT,
ADD COLUMN     "stage_entered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "campaign" TEXT,
ADD COLUMN     "channel" TEXT,
ADD COLUMN     "contacted_at" TIMESTAMP(3),
ADD COLUMN     "created_by_user_id" TEXT,
ADD COLUMN     "last_interaction_at" TIMESTAMP(3),
ADD COLUMN     "updated_by_user_id" TEXT;

-- CreateIndex
CREATE INDEX "lead_cards_store_id_board_key_archived_at_idx" ON "lead_cards"("store_id", "board_key", "archived_at");

-- CreateIndex
CREATE INDEX "leads_store_id_last_interaction_at_idx" ON "leads"("store_id", "last_interaction_at");
