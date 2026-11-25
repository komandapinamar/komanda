import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/integrations/mercadopago/webhooks/[routingKey]/route";

const fakes = vi.hoisted(() => ({
  attempt: vi.fn(),
  persistEvent: vi.fn(),
  updateAttempt: vi.fn(),
  attachPayment: vi.fn(),
  loadCart: vi.fn(),
  createOrder: vi.fn(),
  upsertFinancialRecord: vi.fn(),
  resolveAccount: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/db/tenant-transaction", () => ({
  withPlatformServiceTransaction: (_context: unknown, run: (tx: object) => unknown) => run({}),
  withTenantTransaction: (_context: unknown, run: (tx: object) => unknown) => run({
    insert: () => ({ values: () => ({ onConflictDoUpdate: fakes.upsertFinancialRecord }) }),
  }),
}));
vi.mock("@/features/payments/infrastructure/integration.repository", () => ({
  IntegrationRepository: class { decryptTokens = () => ({ accessToken: "test-account-token" }); },
  WebhookRoutingRepository: class {
    resolveAccount = fakes.resolveAccount;
    findRoute = () => null;
    findPaymentAttempt = fakes.attempt;
    persistEvent = fakes.persistEvent;
    updatePaymentAttemptFromWebhook = fakes.updateAttempt;
    attachPaymentResource = fakes.attachPayment;
  },
}));
vi.mock("@/features/orders/infrastructure/order.repository", () => ({
  OrderRepository: class {
    loadCart = fakes.loadCart;
    createFromCartSnapshot = fakes.createOrder;
  },
}));
vi.mock("@/features/printing/application/print-job.service", () => ({
  PrintJobService: class { enqueueOrderTicketInTransaction = vi.fn(); },
}));
vi.mock("@/lib/audit/audit.service", () => ({ appendAuditEvent: vi.fn() }));
vi.mock("@/lib/outbox/outbox.service", () => ({ appendOutboxEvent: vi.fn() }));

const secret = "test-webhook-secret";
const tenantId = "00000000-0000-4000-8000-000000000001";
const routingKey = "00000000-0000-4000-8000-000000000002";
const attempt = { id: "attempt-1", amount: "120.50", currency: "ARS", cartId: "cart-1", status: "pending", providerPaymentId: null };
const savedOrder = { order: { id: "order-1", locationId: "location-1" }, created: false };
const payment = {
  id: 101,
  status: "approved",
  transaction_amount: 120.5,
  currency_id: "ARS",
  external_reference: attempt.cartId,
  metadata: { paymentAttemptId: attempt.id },
};

function deliver({ query = "101", resource = "101", eventId = "evt-1", topic = "payment" } = {}) {
  const ts = "1795600000";
  const requestId = "request-1";
  const signature = createHmac("sha256", secret).update(`id:${query};request-id:${requestId};ts:${ts};`).digest("hex");
  return POST(new Request(`https://test.invalid/webhook?data.id=${query}`, {
    method: "POST",
    headers: { "x-signature": `ts=${ts},v1=${signature}`, "x-request-id": requestId },
    body: JSON.stringify({ id: eventId, type: topic, data: { id: resource } }),
  }), { params: Promise.resolve({ routingKey }) });
}

describe("Mercado Pago payment webhook delivery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", secret);
    vi.stubGlobal("fetch", fakes.fetch);
    fakes.resolveAccount.mockResolvedValue({ tenantId, id: "account-1" });
    fakes.attempt.mockResolvedValue(attempt);
    fakes.persistEvent.mockResolvedValue({ id: "stored-notification" });
    fakes.fetch.mockImplementation(async () => Response.json(payment));
    fakes.updateAttempt.mockResolvedValue(attempt);
    fakes.loadCart.mockResolvedValue({ status: "validated" });
    fakes.createOrder.mockResolvedValue(savedOrder);
  });

  it("uses the seller payment API and acknowledges only after processing has finished", async () => {
    let start!: () => void;
    const applying = new Promise<void>((resolve) => { start = resolve; });
    let finish!: () => void;
    fakes.createOrder.mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve(savedOrder);
      start();
    }));
    const acknowledged = vi.fn();
    const delivery = deliver().then((response) => {
      acknowledged();
      return response;
    });

    await applying;
    expect(acknowledged).not.toHaveBeenCalled();
    expect(fakes.fetch).toHaveBeenCalledWith("https://api.mercadopago.com/v1/payments/101", expect.objectContaining({
      headers: { Authorization: "Bearer test-account-token" },
    }));
    expect(fakes.updateAttempt).toHaveBeenCalledWith(expect.objectContaining({
      tenantId, integrationAccountId: "account-1", status: "approved",
    }));
    finish();
    const response = await delivery;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true, duplicate: false });
    expect(fakes.upsertFinancialRecord).toHaveBeenCalledOnce();
  });

  it("acknowledges an already processed notification without updating the attempt again", async () => {
    fakes.persistEvent.mockResolvedValue(null);
    const response = await deliver();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accepted: true, duplicate: true });
    expect(fakes.updateAttempt).not.toHaveBeenCalled();
  });

  it("leaves a delivery retryable if Mercado Pago or local routing is temporarily unavailable", async () => {
    fakes.fetch.mockRejectedValueOnce(new Error("timeout"));
    expect((await deliver()).status).toBe(503);
    fakes.attempt.mockResolvedValueOnce(null);
    expect((await deliver()).status).toBe(404);
    expect(fakes.persistEvent).not.toHaveBeenCalled();
    expect((await deliver()).status).toBe(200);
    expect(fakes.updateAttempt).toHaveBeenCalledTimes(1);
  });

  it("applies a provider rejection to a pending attempt without creating a paid order", async () => {
    fakes.fetch.mockImplementation(async () => Response.json({ ...payment, status: "rejected" }));
    fakes.updateAttempt.mockResolvedValue(null);
    expect((await deliver()).status).toBe(200);
    expect(fakes.updateAttempt).toHaveBeenCalledWith(expect.objectContaining({ status: "rejected" }));
    expect(fakes.createOrder).not.toHaveBeenCalled();
  });

  it("does not acknowledge an approved payment if the order could not be created", async () => {
    fakes.createOrder.mockResolvedValue({ order: null, created: false });
    expect((await deliver()).status).toBe(404);
    expect(fakes.upsertFinancialRecord).not.toHaveBeenCalled();
  });

  it("does not regress an approved attempt on a subsequent pending notification", async () => {
    fakes.attempt.mockResolvedValue({ ...attempt, status: "approved", providerPaymentId: "101" });
    fakes.fetch.mockImplementation(async () => Response.json({ ...payment, status: "pending" }));
    expect((await deliver({ eventId: "evt-late" })).status).toBe(200);
    expect(fakes.updateAttempt).not.toHaveBeenCalled();
  });

  it.each([
    { external_reference: "another-cart" },
    { transaction_amount: 1.2 },
    { currency_id: "USD" },
  ])("refuses an approval that does not match the checkout (%o)", async (different) => {
    fakes.fetch.mockImplementation(async () => Response.json({ ...payment, ...different }));
    expect((await deliver()).status).toBe(422);
    expect(fakes.persistEvent).not.toHaveBeenCalled();
    expect(fakes.createOrder).not.toHaveBeenCalled();
  });

  it("rejects mismatched signed and body resource IDs and non-payment topics without a provider call", async () => {
    expect((await deliver({ resource: "102" })).status).toBe(401);
    expect((await deliver({ topic: "merchant_order" })).status).toBe(422);
    expect(fakes.fetch).not.toHaveBeenCalled();
  });
});
