import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();

vi.mock("@/db/tenant-transaction", () => ({
  withPlatformServiceTransaction: vi.fn(
    async (_context: unknown, callback: (transaction: { execute: typeof execute }) => unknown) =>
      callback({ execute }),
  ),
}));

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

  it("does not touch the outbox when there are no consumable event types", async () => {
    const dispatcher = new OutboxDispatcher({ consumers: {}, eventTypes: [] });

    await expect(dispatcher.dispatchOnce()).resolves.toEqual({
      claimed: 0,
      succeeded: 0,
      failed: 0,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("restricts the claim to the registered event types", async () => {
    execute.mockResolvedValueOnce({ rows: [] });
    const dispatcher = new OutboxDispatcher({
      consumers: { "print.intent.created": vi.fn() },
      eventTypes: ["print.intent.created"],
    });

    await dispatcher.dispatchOnce();

    const [query] = execute.mock.calls[0] as [{ queryChunks: unknown[] }];
    const text = flattenSql(query.queryChunks);
    expect(text).toContain("event_type in");
  });
});

function flattenSql(chunks: unknown): string {
  if (!chunks) return "";
  if (Array.isArray(chunks)) return chunks.map(flattenSql).join("");
  if (typeof chunks === "string") return chunks;
  const chunk = chunks as { value?: unknown; queryChunks?: unknown };
  if (Array.isArray(chunk.value)) return chunk.value.join("");
  if (Array.isArray(chunk.queryChunks)) return flattenSql(chunk.queryChunks);
  return "";
}
