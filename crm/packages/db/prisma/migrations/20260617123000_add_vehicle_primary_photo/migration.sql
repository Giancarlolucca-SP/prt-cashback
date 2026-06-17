ALTER TABLE "vehicles" ADD COLUMN "primary_photo_attachment_id" TEXT;

CREATE INDEX "vehicles_primary_photo_attachment_id_idx" ON "vehicles"("primary_photo_attachment_id");
