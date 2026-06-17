-- Add operational filters for S1-US04 inventory workspace.
ALTER TABLE "vehicle_inventory_records"
ADD COLUMN "responsible_user_id" TEXT,
ADD COLUMN "stock_origin" TEXT,
ADD COLUMN "stock_location" TEXT;

CREATE INDEX "vehicle_inventory_records_responsible_user_id_idx" ON "vehicle_inventory_records"("responsible_user_id");
CREATE INDEX "vehicle_inventory_records_stock_origin_idx" ON "vehicle_inventory_records"("stock_origin");
CREATE INDEX "vehicle_inventory_records_stock_location_idx" ON "vehicle_inventory_records"("stock_location");
