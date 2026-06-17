-- Add expected return date for service/preparation visibility in inventory.
ALTER TABLE "service_orders"
ADD COLUMN "expected_return_at" TIMESTAMP(3);

CREATE INDEX "service_orders_expected_return_at_idx" ON "service_orders"("expected_return_at");
