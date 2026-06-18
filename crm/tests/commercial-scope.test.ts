import assert from "node:assert/strict";
import test from "node:test";
import { COMMERCIAL_FULL_VIEW_ROLES, isCommercialFullView } from "../apps/api/src/auth/commercial-scope.js";

test("commercial full-view roles are the unified managerial/administrative set", () => {
  assert.equal(COMMERCIAL_FULL_VIEW_ROLES.size, 3);
  assert.equal(isCommercialFullView("OWNER_MANAGER"), true);
  assert.equal(isCommercialFullView("ADMIN"), true);
  assert.equal(isCommercialFullView("ADMINISTRATIVE"), true);
});

test("operational and unrelated roles are scoped to their own records", () => {
  assert.equal(isCommercialFullView("SELLER"), false);
  assert.equal(isCommercialFullView("SDR"), false);
  assert.equal(isCommercialFullView("APPRAISER"), false);
  assert.equal(isCommercialFullView("SERVICE_MANAGER"), false);
  assert.equal(isCommercialFullView("UNKNOWN"), false);
});
