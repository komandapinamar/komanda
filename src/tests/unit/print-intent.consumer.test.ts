import { beforeEach, describe, expect, it, vi } from "vitest";

const { withTenantTransaction, findById, enqueue } = vi.hoisted(() => ({
  withTenantTransaction: vi.fn(),
  findById: vi.fn(),
  enqueue: vi.fn(),
}));

vi.mock("@/db/tenant-transaction", () => ({
  withTenantTransaction,
}));

vi.mock("@/features/orders/infrastructure/order.repository", () => ({
  OrderRepository: class {
    findById = findById;
  },
}));

vi.mock("@/features/printing/application/print-job.service", () => ({
  PrintJobService: class {
    enqueueOrderTicketInTransaction = enqueue;
  },
}));

const { ensureKitchenPrintJob } = await import(
  "@/workers/outbox/print-intent.consumer"
);

const order = {
  id: "33333333-3333-4333-8333-333333333333",
  fulfillmentStatus: "approved",
  paymentStatus: "paid",
  createdAt: new Date().toISOString(),
};

const event = {
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  aggregateType: "order",
  aggregateId: order.id,
  eventType: "print.intent.created",
  payload: { orderId: order.id },
  sequence: "1",
  attempts: 1,
};

describe("consumidor print.intent.created", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    withTenantTransaction.mockImplementation(async (_context, callback) =>
      callback({}),
    );
    findById.mockResolvedValue(order);
    enqueue.mockResolvedValue({ id: "print-job-1" });
  });

  it("encola el ticket de cocina cuando la orden existe", async () => {
    await ensureKitchenPrintJob(event);

    expect(withTenantTransaction).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith(order.id);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][2]).toEqual(order);
  });

  it("no falla cuando la orden ya no existe", async () => {
    findById.mockResolvedValue(null);

    await expect(ensureKitchenPrintJob(event)).resolves.toBeUndefined();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("no imprime una orden cancelada ni una ya entregada", async () => {
    findById.mockResolvedValue({ ...order, fulfillmentStatus: "cancelled" });
    await ensureKitchenPrintJob(event);

    findById.mockResolvedValue({ ...order, fulfillmentStatus: "delivered" });
    await ensureKitchenPrintJob(event);

    expect(enqueue).not.toHaveBeenCalled();
  });

  it("no encola el ticket de una orden vieja", async () => {
    findById.mockResolvedValue({
      ...order,
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    });

    await ensureKitchenPrintJob(event);

    expect(enqueue).not.toHaveBeenCalled();
  });

  it("propaga el error si el evento no trae orderId", async () => {
    await expect(
      ensureKitchenPrintJob({ ...event, payload: {} }),
    ).rejects.toThrow(/orderId/);
    expect(withTenantTransaction).not.toHaveBeenCalled();
  });
});
