export const roles = [
  "OWNER_MANAGER",
  "ADMIN",
  "ADMINISTRATIVE",
  "SELLER",
  "SDR",
  "APPRAISER",
  "SERVICE_MANAGER"
] as const;

export type Role = (typeof roles)[number];

export const sensitiveAreas = [
  "financial",
  "margin",
  "personal_document",
  "provider_invoice",
  "audit_log",
  "technical_log"
] as const;

export type SensitiveArea = (typeof sensitiveAreas)[number];
