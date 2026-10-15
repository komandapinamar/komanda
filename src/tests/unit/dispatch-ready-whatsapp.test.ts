import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { tx, sendReadyWhatsApp } = vi.hoisted(() => ({
  tx: { select: vi.fn(), execute: vi.fn() },
  sendReadyWhatsApp: vi.fn(),
}));
vi.mock("@/db/tenant-transaction", () => ({
  withPlatformServiceTransaction: vi.fn((_context, callback) => callback(tx)),
  withTenantIdTransaction: vi.fn((_tenant, callback) => callback(tx)),
}));
vi.mock("@/features/orders/infrastructure/whatsapp.client", () => ({ sendReadyWhatsApp }));

import { dispatchReadyWhatsApp } from "@/features/orders/application/dispatch-ready-whatsapp.job";

describe("ready WhatsApp dispatch", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const orderId = "22222222-2222-4222-8222-222222222222";
  let claimCount = 0;
  let customer: Record<string, unknown>;
  let status: string;

  beforeEach(() => {
    vi.clearAllMocks();
    claimCount = 0;
    status = "ready";
    customer = { phone: "11 2345 6789", whatsappReadyOptIn: true };
    tx.select.mockImplementation(() => ({ from: () => {
      const isTenantList = tx.select.mock.calls.length === 1;
      if (isTenantList) return Promise.resolve([{ id: tenantId }]);
      return { where: () => ({ limit: async () => [{
        purchaseNumber: BigInt(1084), fulfillmentStatus: status, paymentStatus: "paid", customer,
      }] }) };
    } }));
    tx.execute.mockImplementation(query => {
      const statement = new PgDialect().sqlToQuery(query).sql;
      if (statement.includes("with candidate")) {
        claimCount++;
        return Promise.resolve({ rows: claimCount === 1 ? [{ id: "event-1", order_id: orderId, attempts: 1 }] : [] });
      }
      return Promise.resolve({ rows: [] });
    });
    sendReadyWhatsApp.mockResolvedValue(undefined);
  });

  it("sends once to the opted-in recipient and marks the event published", async () => {
    expect(await dispatchReadyWhatsApp()).toEqual({ sent: 1, failed: 0 });
    expect(sendReadyWhatsApp).toHaveBeenCalledWith("5491123456789", "1084");
    const publishQuery = tx.execute.mock.calls.find(([query]) =>
      new PgDialect().sqlToQuery(query).sql.includes("published_at = now()"));
    expect(publishQuery).toBeDefined();
  });

  it("skips revoked consent and cancelled orders without sending", async () => {
    customer.whatsappReadyOptIn = false;
    status = "cancelled";
    expect(await dispatchReadyWhatsApp()).toEqual({ sent: 1, failed: 0 });
    expect(sendReadyWhatsApp).not.toHaveBeenCalled();
  });

  it("leaves a failing delivery for retry rather than blocking order transitions", async () => {
    sendReadyWhatsApp.mockRejectedValue(new Error("Meta unavailable"));
    expect(await dispatchReadyWhatsApp()).toEqual({ sent: 0, failed: 1 });
    const retryQuery = tx.execute.mock.calls.find(([query]) =>
      new PgDialect().sqlToQuery(query).sql.includes("last_error = 'WhatsApp delivery failed'"));
    expect(retryQuery).toBeDefined();
  });
});
