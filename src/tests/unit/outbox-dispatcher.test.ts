import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("@/db", () => ({ db: { execute } }));

const { OutboxDispatcher } = await import("@/lib/outbox/outbox-dispatcher");

const event = {
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: "22222222-2222-4222-8222-222222222222",
  aggregateType: "order",
  aggregateId: "33333333-3333-4333-8333-333333333333",
  eventType: "order.created",
  payload: { orderId: "order-1" },
  sequence: "1",
  attempts: 1,
};

describe("OutboxDispatcher", () => {
  beforeEach(() => execute.mockReset());

  it("claims and marks an event published after its consumer succeeds", async () => {
    execute.mockResolvedValueOnce({ rows: [event] }).mockResolvedValueOnce({ rows: [] });
    const consumer = vi.fn().mockResolvedValue(undefined);
    const dispatcher = new OutboxDispatcher({ consumers: { "order.created": consumer } });

    await expect(dispatcher.dispatchOnce()).resolves.toEqual({
      claimed: 1,
      succeeded: 1,
      failed: 0,
    });
    expect(consumer).toHaveBeenCalledWith(event);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("reschedules a failed event without losing the lease ownership check", async () => {
    execute.mockResolvedValueOnce({ rows: [event] }).mockResolvedValueOnce({ rows: [] });
    const dispatcher = new OutboxDispatcher({
      consumers: { "order.created": vi.fn().mockRejectedValue(new Error("temporary failure")) },
    });

    await expect(dispatcher.dispatchOnce()).resolves.toEqual({
      claimed: 1,
      succeeded: 0,
      failed: 1,
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
