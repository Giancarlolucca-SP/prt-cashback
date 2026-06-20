CREATE TABLE "sale_additional_revenue_items" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "vehicle_id" TEXT,
  "buyer_id" TEXT,
  "seller_id" TEXT,
  "item_type" TEXT NOT NULL,
  "item_description" TEXT,
  "sold_by_user_id" TEXT NOT NULL,
  "sold_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "charged_amount" DECIMAL(14,2) NOT NULL,
  "included_in_vehicle_price" BOOLEAN NOT NULL DEFAULT false,
  "item_status" TEXT NOT NULL DEFAULT 'SOLD',
  "commercial_notes" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_additional_revenue_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sale_additional_costs" (
  "id" TEXT NOT NULL,
  "store_id" TEXT NOT NULL,
  "sale_id" TEXT NOT NULL,
  "additional_revenue_item_id" TEXT NOT NULL,
  "cost_category" TEXT NOT NULL,
  "provider_id" TEXT,
  "expected_cost_amount" DECIMAL(14,2),
  "realized_cost_amount" DECIMAL(14,2),
  "cost_status" TEXT NOT NULL DEFAULT 'EXPECTED',
  "cost_date" TIMESTAMP(3),
  "proof_file_id" TEXT,
  "launched_by_user_id" TEXT NOT NULL,
  "notes" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sale_additional_costs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sale_additional_revenue_items_store_id_idx" ON "sale_additional_revenue_items"("store_id");
CREATE INDEX "sale_additional_revenue_items_sale_id_idx" ON "sale_additional_revenue_items"("sale_id");
CREATE INDEX "sale_additional_revenue_items_vehicle_id_idx" ON "sale_additional_revenue_items"("vehicle_id");
CREATE INDEX "sale_additional_revenue_items_buyer_id_idx" ON "sale_additional_revenue_items"("buyer_id");
CREATE INDEX "sale_additional_revenue_items_seller_id_idx" ON "sale_additional_revenue_items"("seller_id");
CREATE INDEX "sale_additional_revenue_items_item_type_idx" ON "sale_additional_revenue_items"("item_type");
CREATE INDEX "sale_additional_revenue_items_store_id_item_status_idx" ON "sale_additional_revenue_items"("store_id", "item_status");

CREATE INDEX "sale_additional_costs_store_id_idx" ON "sale_additional_costs"("store_id");
CREATE INDEX "sale_additional_costs_sale_id_idx" ON "sale_additional_costs"("sale_id");
CREATE INDEX "sale_additional_costs_additional_revenue_item_id_idx" ON "sale_additional_costs"("additional_revenue_item_id");
CREATE INDEX "sale_additional_costs_provider_id_idx" ON "sale_additional_costs"("provider_id");
CREATE INDEX "sale_additional_costs_proof_file_id_idx" ON "sale_additional_costs"("proof_file_id");
CREATE INDEX "sale_additional_costs_store_id_cost_status_idx" ON "sale_additional_costs"("store_id", "cost_status");