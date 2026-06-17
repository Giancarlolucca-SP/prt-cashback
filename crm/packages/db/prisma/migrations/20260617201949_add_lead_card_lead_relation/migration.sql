-- AddForeignKey
ALTER TABLE "lead_cards" ADD CONSTRAINT "lead_cards_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
