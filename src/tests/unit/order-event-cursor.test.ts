import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  formatResetEvent,
  parseEventCursor,
  resolveEventCursor,
} from "@/features/orders/domain/order-event-cursor";

describe("order event cursor resolution", () => {
  it("treats a missing cursor as the start of the log", () => {
    expect(parseEventCursor(null)).toBe(BigInt(0));
    expect(parseEventCursor(undefined)).toBe(BigInt(0));
    expect(parseEventCursor("")).toBe(BigInt(0));
    expect(resolveEventCursor({ raw: null, head: BigInt(42) })).toEqual({
      kind: "ok",
      cursor: BigInt(0),
    });
  });

  it("accepts a cursor at or below the tenant head", () => {
    expect(resolveEventCursor({ raw: "42", head: BigInt(42) })).toEqual({
      kind: "ok",
      cursor: BigInt(42),
    });
    expect(resolveEventCursor({ raw: "7", head: BigInt(42) })).toEqual({
      kind: "ok",
      cursor: BigInt(7),
    });
  });

  it("requests a reset for a malformed cursor without treating it as no events", () => {
    expect(parseEventCursor("not-a-sequence")).toBeNull();
    expect(resolveEventCursor({ raw: "not-a-sequence", head: BigInt(9) })).toEqual({
      kind: "reset",
      reason: "malformed",
      head: BigInt(9),
    });
  });

  it("requests a reset when the cursor is ahead of the tenant head", () => {
    expect(resolveEventCursor({ raw: "100", head: BigInt(42) })).toEqual({
      kind: "reset",
      reason: "ahead",
      head: BigInt(42),
    });
    expect(resolveEventCursor({ raw: "1", head: BigInt(0) })).toEqual({
      kind: "reset",
      reason: "ahead",
      head: BigInt(0),
    });
  });

  it("accepts leading zeros and huge sequences without overflow", () => {
    expect(parseEventCursor("007")).toBe(BigInt(7));
    expect(parseEventCursor("0")).toBe(BigInt(0));
    const huge = "99999999999999999999999999";
    expect(parseEventCursor(huge)).toBe(BigInt(huge));
    expect(resolveEventCursor({ raw: huge, head: BigInt(huge) })).toEqual({
      kind: "ok",
      cursor: BigInt(huge),
    });
  });

  it("rejects whitespace and signed or decimal values as malformed", () => {
    expect(parseEventCursor(" 7")).toBeNull();
    expect(parseEventCursor("7 ")).toBeNull();
    expect(parseEventCursor("+7")).toBeNull();
    expect(parseEventCursor("7.0")).toBeNull();
    expect(parseEventCursor("1e3")).toBeNull();
  });

  it("formats the reset frame the client contract expects", () => {
    expect(formatResetEvent({ reason: "ahead", head: BigInt(1042) })).toBe(
      'event: reset\ndata: {"reason":"ahead","headSequence":"1042"}\n\n',
    );
    expect(formatResetEvent({ reason: "malformed", head: "9" })).toBe(
      'event: reset\ndata: {"reason":"malformed","headSequence":"9"}\n\n',
    );
  });
});

describe("order event stream contract", () => {
  it("emits the reset control event in both SSE adapters and resumes from head", async () => {
    const [nextRoute, fastifyRoute] = await Promise.all([
      readFile("app/api/v1/tenants/[tenantId]/orders/events/route.ts", "utf8"),
      readFile("fastify/routes/order-events.ts", "utf8"),
    ]);

    for (const source of [nextRoute, fastifyRoute]) {
      expect(source).toContain("resolveEventCursor");
      expect(source).toContain("formatResetEvent");
      // The cursor must be overwritten with head, otherwise the announced reset
      // is contradicted by a stream that still filters from the bad cursor.
      expect(source).toContain("lastEventId = resolution.head.toString()");
    }
  });
});
