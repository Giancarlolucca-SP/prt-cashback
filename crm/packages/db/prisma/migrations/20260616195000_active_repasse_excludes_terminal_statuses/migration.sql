-- Active repasse uniqueness must ignore terminal processes.
DROP INDEX IF EXISTS "repasse_processes_store_vehicle_active_key";

CREATE UNIQUE INDEX "repasse_processes_store_vehicle_active_key"
ON "repasse_processes"("store_id", "vehicle_id")
WHERE "deleted_at" IS NULL
  AND "status" NOT IN ('CANCELLED', 'REVENUE_RECOGNIZED');
