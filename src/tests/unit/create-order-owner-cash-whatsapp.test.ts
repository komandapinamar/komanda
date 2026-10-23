import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

const state = vi.hoisted(() => ({
  preset: "express_retail",
  phone: "5491123456789" as string | null,
  created: true,
  outbox: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction: (_context: unknown, callback: (tx: unknown) => Promise<unknown>) => callback({
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [[
      { currency: "ARS" }, { id: "location-1" }, { preset: state.preset }, { phone: state.phone },
    ][selectCount++]] }) }) }),
    insert: () => ({ values: async () => undefined }),
  }),
}));

let selectCount = 0;
vi.mock("@/features/cart/infrastructure/cart.repository", () => ({
  CartRepository: class {
    loadSelection() { return Promise.resolve({ name: "Yerba", currency: "ARS", price: "1000.00", imageUrl: null }); }
    create() { return Promise.resolve({ id: "cart-1" }); }
  },
}));
vi.mock("@/features/cart/domain/cart.rules", () => ({
  centsToMoney: (cents: number) => (cents / 100).toFixed(2),
  moneyToCents: (amount: string) => Math.round(Number(amount) * 100),
  revalidateCartSelection: () => ({ unitPriceCents: 100000, options: [] }),
}));
vi.mock("@/features/orders/infrastructure/order.repository", () => ({
  OrderRepository: class {
    createFromCartSnapshot(input: { paymentStatus: string; tender: string }) {
      return Promise.resolve({
        order: { id: "order-1", purchaseNumber: "12", source: "admin_direct", fulfillmentStatus: "approved",
          paymentStatus: input.paymentStatus, tender: input.tender, total: "1000.00", currency: "ARS", locationId: "location-1",
          customer: { name: "NN" } },
        created: state.created,
      });
    }
  },
}));
vi.mock("@/lib/audit/audit.service", () => ({ appendAuditEvent: vi.fn() }));
vi.mock("@/lib/outbox/outbox.service", () => ({
  appendOutboxEvent: vi.fn(async (_tx, _context, event) => { state.outbox.push(event); }),
}));
vi.mock("@/features/printing/application/print-job.service", () => ({
  PrintJobService: class { enqueueOrderTicketInTransaction = vi.fn(); },
}));
vi.mock("@/features/billing/infrastructure/billing.repository", () => ({
  BillingRepository: class { issueDocument = vi.fn(); },
}));

import { CreateOrderService } from "@/features/orders/application/create-order.service";

describe("owner cash WhatsApp enqueue on direct order creation", () => {
  const context = createVerifiedTenantContext({
    tenantId: "11111111-1111-4111-8111-111111111111",
    correlationId: "test-correlation",
    source: "administrative",
    actor: { kind: "user", userId: "user-1", membershipId: "membership-1", role: "owner" },
  });
  const request = {
    items: [{ kind: "item", resourceId: "22222222-2222-4222-8222-222222222222", quantity: 1 }],
    tender: "cash",
    paymentStatus: "pending",
  };

  beforeEach(() => {
    state.preset = "express_retail";
    state.phone = "5491123456789";
    state.created = true;
    state.outbox = [];
    selectCount = 0;
  });

  it("adds one owner event atomically for a newly created eligible order", async () => {
    await new CreateOrderService().createDirectFromItems(context, request, "33333333-3333-4333-8333-333333333333");
    expect(state.outbox.filter(event => event.eventType === "order.whatsapp_owner_cash_pending")).toEqual([
      expect.objectContaining({ aggregateId: "order-1", payload: { orderId: "order-1" } }),
    ]);
  });

  it.each([
    ["gastronomy", { preset: "gastronomy" }],
    ["missing phone", { phone: null }],
    ["replayed order", { created: false }],
    ["paid cash order", { request: { ...request, paymentStatus: "paid" } }],
    ["non-cash order", { request: { ...request, tender: "posnet" } }],
  ])("does not enqueue an owner event for %s", async (_label, override: {
    preset?: string;
    phone?: string | null;
    created?: boolean;
    request?: typeof request;
  }) => {
    const { request: input = request, ...changes } = override;
    Object.assign(state, changes);
    await new CreateOrderService().createDirectFromItems(context, input, "33333333-3333-4333-8333-333333333333");
    expect(state.outbox.some(event => event.eventType === "order.whatsapp_owner_cash_pending")).toBe(false);
  });
});
