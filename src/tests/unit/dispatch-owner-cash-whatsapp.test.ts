import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { tx, sendOwnerCashPendingWhatsApp } = vi.hoisted(() => ({
  tx: { select: vi.fn(), execute: vi.fn() },
  sendOwnerCashPendingWhatsApp: vi.fn(),
}));
vi.mock("@/db/tenant-transaction", () => ({
  withPlatformServiceTransaction: vi.fn((_context, callback) => callback(tx)),
  withTenantIdTransaction: vi.fn((_tenant, callback) => callback(tx)),
}));
vi.mock("@/features/orders/infrastructure/whatsapp.client", () => ({ sendOwnerCashPendingWhatsApp }));
import { dispatchOwnerCashWhatsApp } from "@/features/orders/application/dispatch-owner-cash-whatsapp.job";

describe("owner cash WhatsApp dispatch", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";
  let claimCount = 0;
  let selected = 0;
  let claimLimit = 1;
  let state: { preset: string; phone: string | null; paymentStatus: string; fulfillmentStatus: string; tender: string; source: string };
  beforeEach(() => {
    vi.clearAllMocks();
    claimCount = 0;
    claimLimit = 1;
    selected = 0;
    state = { preset: "express_retail", phone: "+54 9 11 2345-6789", paymentStatus: "pending", fulfillmentStatus: "approved", tender: "cash", source: "admin_direct" };
    tx.select.mockImplementation(() => {
      selected++;
      if (selected === 1) return { from: () => Promise.resolve([{ id: tenantId }]) };
      const results = [
        [{ name: "Kiosco", preset: state.preset }],
        [{ phone: state.phone }],
         [{ id: "order-1", purchaseNumber: BigInt(42), total: "1250.00", currency: "ARS", tender: state.tender, paymentStatus: state.paymentStatus, fulfillmentStatus: state.fulfillmentStatus, source: state.source }],
        [{ name: "Yerba", quantity: 2 }],
      ];
      const result = results[selected - 2];
      return { from: () => ({ where: () => selected === 5 ? Promise.resolve(result) : ({ limit: async () => result }) }) };
    });
    tx.execute.mockImplementation(query => {
      const statement = new PgDialect().sqlToQuery(query).sql;
      if (statement.includes("with candidate")) {
        claimCount++;
         return Promise.resolve({ rows: claimCount <= claimLimit ? [{ id: `event-${claimCount}`, order_id: "order-1", attempts: claimCount }] : [] });
      }
      return Promise.resolve({ rows: [] });
    });
    sendOwnerCashPendingWhatsApp.mockResolvedValue(undefined);
  });

  it("sends using the current normalized recipient and order snapshot", async () => {
    expect(await dispatchOwnerCashWhatsApp()).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(sendOwnerCashPendingWhatsApp).toHaveBeenCalledWith({ phone: "5491123456789", business: "Kiosco", purchaseNumber: "42", amount: "1250.00 ARS", items: "2× Yerba" });
  });

  it.each([
    ["paid", "approved"],
    ["pending", "cancelled"],
  ])("consumes a stale order (%s/%s) without sending", async (paymentStatus, fulfillmentStatus) => {
    state.paymentStatus = paymentStatus;
    state.fulfillmentStatus = fulfillmentStatus;
    expect(await dispatchOwnerCashWhatsApp()).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(sendOwnerCashPendingWhatsApp).not.toHaveBeenCalled();
  });

  it.each([
    ["gastronomy", { preset: "gastronomy" }],
    ["cleared phone", { phone: null }],
    ["invalid phone", { phone: "not-a-phone" }],
    ["non-cash order", { tender: "posnet" }],
    ["wrong source", { source: "storefront_cash" }],
  ])("skips %s", async (_label, override) => {
    state = { ...state, ...override };
    expect(await dispatchOwnerCashWhatsApp()).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(sendOwnerCashPendingWhatsApp).not.toHaveBeenCalled();
  });

  it("retries a Meta transport failure", async () => {
    sendOwnerCashPendingWhatsApp.mockRejectedValue(new Error("Meta unavailable"));
    expect(await dispatchOwnerCashWhatsApp()).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect(tx.execute.mock.calls.some(([query]) => new PgDialect().sqlToQuery(query).sql.includes("dead_letter_at = case when attempts >= 5"))).toBe(true);
  });

  it("dead-letters after exactly five failed attempts", async () => {
    claimLimit = 5;
    sendOwnerCashPendingWhatsApp.mockRejectedValue(new Error("Meta unavailable"));
    expect(await dispatchOwnerCashWhatsApp()).toEqual({ sent: 0, skipped: 0, failed: 5 });
    const updates = tx.execute.mock.calls.map(([query]) => new PgDialect().sqlToQuery(query).sql)
      .filter(statement => statement.includes("dead_letter_at = case when attempts >= 5"));
    expect(updates).toHaveLength(5);
    expect(claimCount).toBe(6);
  });
});
