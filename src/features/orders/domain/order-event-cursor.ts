export type EventCursorResolution =
  | { kind: "ok"; cursor: bigint }
  | { kind: "reset"; reason: "malformed" | "ahead"; head: bigint };

export function parseEventCursor(value: string | null | undefined): bigint | null {
  if (!value) return BigInt(0);
  if (!/^\d+$/.test(value)) return null;
  return BigInt(value);
}

export function resolveEventCursor(input: {
  raw: string | null | undefined;
  head: bigint;
}): EventCursorResolution {
  const parsed = parseEventCursor(input.raw);
  if (parsed === null) {
    return { kind: "reset", reason: "malformed", head: input.head };
  }
  if (parsed > input.head) {
    return { kind: "reset", reason: "ahead", head: input.head };
  }
  return { kind: "ok", cursor: parsed };
}

export function formatResetEvent(input: {
  reason: "malformed" | "ahead";
  head: bigint | string;
}) {
  const head =
    typeof input.head === "bigint" ? input.head.toString() : input.head;
  return `event: reset\ndata: ${JSON.stringify({
    reason: input.reason,
    headSequence: head,
  })}\n\n`;
}
