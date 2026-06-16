-- One revenue recognition is allowed per repasse process.
CREATE UNIQUE INDEX "repasse_revenues_repasse_process_id_key" ON "repasse_revenues"("repasse_process_id");
