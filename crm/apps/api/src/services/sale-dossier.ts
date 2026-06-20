import type { Prisma, Sale } from "@prisma/client";

type DossierSale = Pick<Sale, "id" | "storeId" | "vehicleId" | "customerId" | "sellerUserId" | "leadId" | "status" | "closedAt">;

function dossierStatusForSale(status: string) {
  if (status === "CANCELLED") return "CANCELLED";
  if (status === "CLOSED") return "CLOSED";
  return "OPEN";
}

export async function ensureSaleDossier(
  tx: Prisma.TransactionClient,
  sale: DossierSale,
  input: { actorUserId?: string | null; summary?: Prisma.InputJsonValue } = {},
) {
  const now = new Date();
  const summary = input.summary ?? {
    source: "sale_dossier",
    status: sale.status,
    actorUserId: input.actorUserId ?? null,
  };

  return tx.saleDossier.upsert({
    where: { storeId_saleId: { storeId: sale.storeId, saleId: sale.id } },
    update: {
      vehicleId: sale.vehicleId,
      buyerId: sale.customerId,
      sellerUserId: sale.sellerUserId,
      leadId: sale.leadId,
      status: dossierStatusForSale(sale.status),
      closedAt: sale.status === "CLOSED" ? sale.closedAt ?? now : null,
      lastEventAt: now,
      summary,
    },
    create: {
      storeId: sale.storeId,
      saleId: sale.id,
      vehicleId: sale.vehicleId,
      buyerId: sale.customerId,
      sellerUserId: sale.sellerUserId,
      leadId: sale.leadId,
      status: dossierStatusForSale(sale.status),
      openedAt: sale.closedAt ?? now,
      closedAt: sale.status === "CLOSED" ? sale.closedAt ?? now : null,
      lastEventAt: now,
      summary,
    },
  });
}
