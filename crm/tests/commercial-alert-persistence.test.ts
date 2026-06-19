import assert from "node:assert/strict";
import test from "node:test";
import {
  activeCommercialAlertWhere,
  commercialAlertCreateData,
  persistCommercialAlert,
  resolveCommercialAlertCondition,
} from "../apps/api/src/services/commercial-alert-persistence.js";
import { detectFollowUpOverdueAlert } from "../apps/api/src/services/commercial-alert.js";

const NOW = new Date("2026-06-18T12:00:00.000Z");
const DUE_AT = new Date("2026-06-18T09:00:00.000Z");

function candidate() {
  const alert = detectFollowUpOverdueAlert({
    cardId: "card-1",
    leadId: "lead-1",
    nextActionAt: DUE_AT,
    resolved: false,
    now: NOW,
  });
  assert.ok(alert);
  return {
    ...alert,
    storeId: "store-1",
    customerId: "customer-1",
    vehicleId: "vehicle-1",
    responsibleUserId: "seller-1",
    targetUserId: "seller-1",
  };
}

function fakeClient(existing: any = null) {
  const calls: any[] = [];
  return {
    calls,
    commercialAlert: {
      async findFirst(args: any) {
        calls.push(["findFirst", args]);
        return existing;
      },
      async create(args: any) {
        calls.push(["create", args]);
        return { id: "created-alert", createdAt: NOW, ...args.data };
      },
      async update(args: any) {
        calls.push(["update", args]);
        return { ...existing, ...args.data };
      },
      async updateMany(args: any) {
        calls.push(["updateMany", args]);
        return { count: existing ? 1 : 0 };
      },
    },
  };
}

test("create data maps a candidate to the commercial alert table shape", () => {
  const data = commercialAlertCreateData(candidate());
  assert.equal(data.storeId, "store-1");
  assert.equal(data.alertType, "follow_up_overdue");
  assert.equal(data.status, "PENDING");
  assert.deepEqual(data.card, { connect: { id: "card-1" } });
  assert.equal(data.leadId, "lead-1");
  assert.equal(data.customerId, "customer-1");
  assert.equal(data.vehicleId, "vehicle-1");
  assert.equal(data.responsibleUserId, "seller-1");
  assert.equal((data.metadata as { dedupKey: string }).dedupKey, "follow_up_overdue:card-1");
});

test("active alert where scopes idempotency to open statuses", () => {
  assert.deepEqual(activeCommercialAlertWhere({ storeId: "store-1", cardId: "card-1", alertType: "lead_cooling" }), {
    storeId: "store-1",
    cardId: "card-1",
    alertType: "lead_cooling",
    status: { in: ["PENDING", "VIEWED"] },
  });
});

test("persistCommercialAlert creates when there is no active duplicate", async () => {
  const client = fakeClient();
  const result = await persistCommercialAlert(client as any, candidate());

  assert.equal(result.created, true);
  assert.equal(result.alert.id, "created-alert");
  assert.deepEqual(client.calls.map((call) => call[0]), ["findFirst", "create"]);
});

test("persistCommercialAlert refreshes an existing open alert instead of duplicating", async () => {
  const client = fakeClient({ id: "existing-alert", status: "VIEWED", createdAt: NOW });
  const result = await persistCommercialAlert(client as any, candidate());

  assert.equal(result.created, false);
  assert.equal(result.alert.id, "existing-alert");
  assert.deepEqual(client.calls.map((call) => call[0]), ["findFirst", "update"]);
  assert.equal(client.calls[1][1].where.id, "existing-alert");
  assert.equal(client.calls[1][1].data.status, undefined);
});

test("resolveCommercialAlertCondition closes active alerts for a resolved condition", async () => {
  const client = fakeClient({ id: "existing-alert", status: "PENDING", createdAt: NOW });
  const count = await resolveCommercialAlertCondition(client as any, {
    storeId: "store-1",
    cardId: "card-1",
    alertType: "follow_up_overdue",
    resolvedByUserId: "owner-1",
    now: NOW,
  });

  assert.equal(count, 1);
  assert.equal(client.calls[0][0], "updateMany");
  assert.equal(client.calls[0][1].data.status, "RESOLVED");
  assert.equal(client.calls[0][1].data.resolvedByUserId, "owner-1");
});
