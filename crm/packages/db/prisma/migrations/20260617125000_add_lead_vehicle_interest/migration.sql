ALTER TABLE "leads" ADD COLUMN "vehicle_id" TEXT;

CREATE INDEX "leads_vehicle_id_idx" ON "leads"("vehicle_id");
