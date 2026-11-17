import { describe, expect, it } from "vitest";

import {
  CONSUMED_OUTBOX_EVENT_TYPES,
  DEDICATED_JOB_OUTBOX_EVENT_TYPES,
  OUTBOX_EVENT_TYPES,
} from "@/lib/outbox/outbox-event-types";
import {
  OUTBOX_CONSUMED_EVENT_TYPES,
  OUTBOX_CONSUMERS,
} from "@/workers/outbox/consumer-registry";

describe("registro de consumidores de la outbox", () => {
  it("declara un consumidor por cada tipo que el dispatcher puede reclamar", () => {
    expect([...OUTBOX_CONSUMED_EVENT_TYPES].sort()).toEqual(
      [...CONSUMED_OUTBOX_EVENT_TYPES].sort(),
    );
    expect(Object.keys(OUTBOX_CONSUMERS).sort()).toEqual(
      [...CONSUMED_OUTBOX_EVENT_TYPES].sort(),
    );
  });

  it("no reclama los tipos que atiende un job dedicado", () => {
    for (const eventType of DEDICATED_JOB_OUTBOX_EVENT_TYPES) {
      expect(OUTBOX_CONSUMED_EVENT_TYPES).not.toContain(eventType);
      expect(Object.keys(OUTBOX_CONSUMERS)).not.toContain(eventType);
    }
  });

  it("registra el consumidor de print.intent.created", () => {
    expect(
      OUTBOX_CONSUMERS[OUTBOX_EVENT_TYPES.PRINT_INTENT_CREATED],
    ).toBeTypeOf("function");
  });
});
