// Pure (DB-free) helpers describing how technical delivery files are linked to the
// rest of the system. Kept separate so the linking contract is unit-testable.

export const TECHNICAL_DELIVERY_DOCUMENT_PURPOSE = "technical_delivery_document";
export const TECHNICAL_DELIVERY_SIGNED_COPY_PURPOSE = "technical_delivery_signed_copy";

export type DeliveryLinkEntityType = "vehicle" | "sale" | "customer";

export type DeliveryLinkTarget = {
  entityType: DeliveryLinkEntityType;
  entityId: string;
};

// The signed copy (and the generated document) must land in the vehicle digital folder
// and stay tied to the sale and the customer (Armazenamento / acceptance criteria).
export function technicalDeliveryLinkTargets(input: {
  vehicleId: string;
  saleId: string;
  customerId: string;
}): DeliveryLinkTarget[] {
  return [
    { entityType: "vehicle", entityId: input.vehicleId },
    { entityType: "sale", entityId: input.saleId },
    { entityType: "customer", entityId: input.customerId },
  ];
}
