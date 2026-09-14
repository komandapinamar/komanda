import { createHash } from "node:crypto";
import { and, eq, isNull, lt } from "drizzle-orm";
import { idempotencyRecords } from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";

export class IdempotencyConflictError extends Error {}
export class IdempotencyInProgressError extends Error {}

export type IdempotencyReplay = {
  replayed: true;
  status: number;
  body: unknown;
};

export type IdempotencyClaim = {
  replayed: false;
  recordId: string;
  requestHash: string;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

export function hashIdempotencyRequest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function recordIdentity(
  tenantId: string | null,
  scope: string,
  idempotencyKey: string,
) {
  return and(
    tenantId === null
      ? isNull(idempotencyRecords.tenantId)
      : eq(idempotencyRecords.tenantId, tenantId),
    eq(idempotencyRecords.scope, scope),
    eq(idempotencyRecords.idempotencyKey, idempotencyKey),
  );
}

export class IdempotencyService {
  constructor(private readonly transaction: TenantTransaction) {}

  async claim(input: {
    tenantId: string | null;
    scope: string;
    key: string;
    request: unknown;
    lockSeconds?: number;
    retentionSeconds?: number;
  }): Promise<IdempotencyClaim | IdempotencyReplay> {
    const key = input.key.trim();
    if (!key || key.length > 255) {
      throw new IdempotencyConflictError("Invalid idempotency key.");
    }
    const now = new Date();
    const lockUntil = new Date(
      now.getTime() + (input.lockSeconds ?? 30) * 1000,
    );
    const expiresAt = new Date(
      now.getTime() + (input.retentionSeconds ?? 86_400) * 1000,
    );
    const requestHash = hashIdempotencyRequest(input.request);

    const inserted = await this.transaction
      .insert(idempotencyRecords)
      .values({
        tenantId: input.tenantId,
        scope: input.scope,
        idempotencyKey: key,
        requestHash,
        state: "processing",
        lockedUntil: lockUntil,
        expiresAt,
      })
      .onConflictDoNothing()
      .returning({ id: idempotencyRecords.id });

    if (inserted[0]) {
      return {
        replayed: false,
        recordId: inserted[0].id,
        requestHash,
      };
    }

    const [record] = await this.transaction
      .select()
      .from(idempotencyRecords)
      .where(recordIdentity(input.tenantId, input.scope, key))
      .limit(1);

    if (!record) throw new Error("Failed to persist idempotency claim.");
    if (record.requestHash !== requestHash) {
      throw new IdempotencyConflictError(
        "Idempotency key was already used for a different request.",
      );
    }
    if (record.state === "completed") {
      return {
        replayed: true,
        status: record.responseStatus ?? 200,
        body: record.responseBody,
      };
    }

    if (record.lockedUntil > now) {
      throw new IdempotencyInProgressError("Request is already in progress.");
    }

    if (record.lockedUntil <= now || record.state === "failed") {
      const reclaimed = await this.transaction
        .update(idempotencyRecords)
        .set({ state: "processing", lockedUntil: lockUntil, updatedAt: now })
        .where(
          and(
            eq(idempotencyRecords.id, record.id),
            lt(idempotencyRecords.lockedUntil, now),
          ),
        )
        .returning({ id: idempotencyRecords.id });
      if (reclaimed.length === 0) {
        throw new IdempotencyInProgressError("Request is already in progress.");
      }
    }

    return { replayed: false, recordId: record.id, requestHash };
  }

  async complete(recordId: string, status: number, body: unknown) {
    await this.transaction
      .update(idempotencyRecords)
      .set({
        state: "completed",
        responseStatus: status,
        responseBody: body,
        updatedAt: new Date(),
      })
      .where(eq(idempotencyRecords.id, recordId));
  }

  async fail(recordId: string) {
    await this.transaction
      .update(idempotencyRecords)
      .set({ state: "failed", lockedUntil: new Date(0), updatedAt: new Date() })
      .where(eq(idempotencyRecords.id, recordId));
  }
}
