import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("packages/db/prisma/schema.prisma", "utf8");

function modelBlock(modelName) {
  const match = schema.match(new RegExp(`model\\s+${modelName}\\s+\\{([\\s\\S]*?)\\n\\}`, "m"));
  assert.ok(match, `model ${modelName} should exist`);
  return match[1];
}

test("main scoped entities keep store_id for future multi-unit support", () => {
  const scopedModels = [
    "Customer",
    "Lead",
    "Vehicle",
    "VehicleInventoryRecord",
    "Sale",
    "FinancialTransaction",
    "Listing",
    "ServiceOrder",
    "PostSaleCustomer"
  ];

  for (const model of scopedModels) {
    assert.match(modelBlock(model), /storeId\s+String.*@map\("store_id"\)/, `${model} should map storeId to store_id`);
  }
});

test("attachments and audit logs use flexible entity references", () => {
  const attachmentLink = modelBlock("FileAttachmentLink");
  assert.match(attachmentLink, /entityType\s+String\s+@map\("entity_type"\)/);
  assert.match(attachmentLink, /entityId\s+String\s+@map\("entity_id"\)/);

  const auditLog = modelBlock("AuditLog");
  assert.match(auditLog, /entityType\s+String\s+@map\("entity_type"\)/);
  assert.match(auditLog, /entityId\s+String\s+@map\("entity_id"\)/);
  assert.match(auditLog, /@@map\("audit_logs"\)/);
});

test("financially closed domains preserve snapshots", () => {
  for (const model of ["Sale", "DreSnapshot", "CommissionCalculation", "Contract", "TaxSettingsSnapshot"]) {
    assert.match(modelBlock(model), /snapshot|data/, `${model} should preserve a snapshot/data payload`);
  }
});

test("preview-approved domains have persistent models", () => {
  for (const model of ["PostSaleCustomer", "ServiceCatalogItem", "BalanceSheetSnapshot", "ListingMetric", "RepasseProcess"]) {
    modelBlock(model);
  }
});
