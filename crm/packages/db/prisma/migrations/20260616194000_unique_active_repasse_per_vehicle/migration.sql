-- Only one active repasse process may exist per vehicle in a store.
CREATE UNIQUE INDEX "repasse_processes_store_vehicle_active_key"
ON "repasse_processes"("store_id", "vehicle_id")
WHERE "deleted_at" IS NULL;
