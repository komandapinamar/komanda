import { and, eq, sql } from "drizzle-orm";
import {
  printJobAttempts,
  tenantPrintJobs,
  tenantSettings,
} from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";
import type { TenantContext } from "@/lib/tenant-context/types";

type PrintJobRecord = typeof tenantPrintJobs.$inferSelect;

export type PrintJobClaim = {
  job: {
    id: string;
    orderId: string;
    attemptNumber: number;
    payload: Record<string, unknown>;
  };
  leaseExpiresAt: string;
};

function agentId(context: TenantContext) {
  return context.actor.kind === "agent" ? context.actor.agentId : null;
}

function agentLocationId(context: TenantContext) {
  return context.actor.kind === "agent" ? context.actor.locationId : context.locationId;
}

function retryDate(attemptNumber: number) {
  const seconds = 15 * 2 ** Math.max(attemptNumber - 1, 0);
  return new Date(Date.now() + seconds * 1000);
}

function dateValue(value: Date | string | null) {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

function serializeClaim(job: PrintJobRecord): PrintJobClaim {
  if (!job.leaseExpiresAt) {
    throw new Error("Claimed print job is missing a lease.");
  }
  return {
    job: {
      id: job.id,
      orderId: job.orderId,
      attemptNumber: job.attemptCount,
      payload: job.payload,
    },
    leaseExpiresAt: job.leaseExpiresAt.toISOString(),
  };
}

export class PrintJobRepository {
  constructor(
    private readonly transaction: TenantTransaction,
    private readonly context: TenantContext,
  ) {}

  private get tenantId() {
    return this.context.tenantId;
  }

  async tenantPrintingEnabled() {
    const [settings] = await this.transaction
      .select({ enabled: tenantSettings.printingEnabled })
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, this.tenantId))
      .limit(1);
    return settings?.enabled === true;
  }

  async create(input: {
    locationId: string;
    orderId: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  }) {
    const now = new Date();
    const [inserted] = await this.transaction
      .insert(tenantPrintJobs)
      .values({
        tenantId: this.tenantId,
        locationId: input.locationId,
        orderId: input.orderId,
        status: "pending",
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        attemptCount: 0,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) return inserted;
    const [existing] = await this.transaction
      .select()
      .from(tenantPrintJobs)
      .where(
        and(
          eq(tenantPrintJobs.tenantId, this.tenantId),
          eq(tenantPrintJobs.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    return existing ?? null;
  }

  async claimNext(leaseSeconds = 60) {
    const currentAgentId = agentId(this.context);
    const currentLocationId = agentLocationId(this.context);
    if (!currentAgentId || !currentLocationId) {
      throw new Error("Print claim requires an agent context.");
    }

    const result = await this.transaction.execute<{
      id: string;
      tenant_id: string;
      location_id: string;
      order_id: string;
      status: PrintJobRecord["status"];
      idempotency_key: string;
      payload: Record<string, unknown>;
      attempt_count: number;
      claimed_by_agent_id: string | null;
      lease_expires_at: Date | string | null;
      next_attempt_at: Date | string | null;
      printed_at: Date | string | null;
      last_error_code: string | null;
      last_error_message: string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(sql`
      with candidate as (
        select id
        from print_jobs
        where tenant_id = ${this.tenantId}::uuid
          and location_id = ${currentLocationId}::uuid
          and (
            (status in ('pending', 'failed') and (next_attempt_at is null or next_attempt_at <= now()))
            or (status = 'processing' and lease_expires_at <= now())
          )
        order by next_attempt_at nulls first, created_at
        for update skip locked
        limit 1
      )
      update print_jobs
      set status = 'processing',
          attempt_count = print_jobs.attempt_count + 1,
          claimed_by_agent_id = ${currentAgentId}::uuid,
          lease_expires_at = now() + (${leaseSeconds} || ' seconds')::interval,
          next_attempt_at = null,
          updated_at = now()
      where id in (select id from candidate)
      returning *
    `);
    const row = result.rows[0];
    if (!row) return null;

    const record: PrintJobRecord = {
      id: row.id,
      tenantId: row.tenant_id,
      locationId: row.location_id,
      orderId: row.order_id,
      status: row.status,
      idempotencyKey: row.idempotency_key,
      payload: row.payload,
      attemptCount: row.attempt_count,
      claimedByAgentId: row.claimed_by_agent_id,
      leaseExpiresAt: dateValue(row.lease_expires_at),
      nextAttemptAt: dateValue(row.next_attempt_at),
      printedAt: dateValue(row.printed_at),
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      createdAt: dateValue(row.created_at)!,
      updatedAt: dateValue(row.updated_at)!,
    };

    await this.transaction
      .insert(printJobAttempts)
      .values({
        tenantId: this.tenantId,
        printJobId: record.id,
        agentId: currentAgentId,
        attemptNumber: record.attemptCount,
        status: "claimed",
      })
      .onConflictDoNothing();
    return serializeClaim(record);
  }

  async reportResult(input: {
    jobId: string;
    attemptNumber: number;
    status: "printed" | "failed";
    errorCode?: string | null;
    errorMessage?: string | null;
  }) {
    const currentAgentId = agentId(this.context);
    const currentLocationId = agentLocationId(this.context);
    if (!currentAgentId || !currentLocationId) {
      throw new Error("Print result requires an agent context.");
    }

    const [existing] = await this.transaction
      .select()
      .from(tenantPrintJobs)
      .where(
        and(
          eq(tenantPrintJobs.tenantId, this.tenantId),
          eq(tenantPrintJobs.locationId, currentLocationId),
          eq(tenantPrintJobs.id, input.jobId),
        ),
      )
      .limit(1);
    if (!existing) return null;
    if (
      existing.status === "printed" &&
      input.status === "printed" &&
      existing.attemptCount === input.attemptNumber
    ) {
      return existing;
    }
    if (
      existing.claimedByAgentId !== currentAgentId ||
      existing.attemptCount !== input.attemptNumber
    ) {
      return null;
    }

    const now = new Date();
    const [updated] = await this.transaction
      .update(tenantPrintJobs)
      .set(
        input.status === "printed"
          ? {
              status: "printed",
              claimedByAgentId: null,
              leaseExpiresAt: null,
              nextAttemptAt: null,
              printedAt: now,
              lastErrorCode: null,
              lastErrorMessage: null,
              updatedAt: now,
            }
          : {
              status: "failed",
              claimedByAgentId: null,
              leaseExpiresAt: null,
              nextAttemptAt: retryDate(input.attemptNumber),
              lastErrorCode: input.errorCode ?? "worker_failed",
              lastErrorMessage: input.errorMessage ?? "Print worker reported failure.",
              updatedAt: now,
            },
      )
      .where(
        and(
          eq(tenantPrintJobs.tenantId, this.tenantId),
          eq(tenantPrintJobs.id, input.jobId),
        ),
      )
      .returning();
    if (!updated) return null;

    await this.transaction
      .insert(printJobAttempts)
      .values({
        tenantId: this.tenantId,
        printJobId: updated.id,
        agentId: currentAgentId,
        attemptNumber: input.attemptNumber,
        status: input.status,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
        finishedAt: now,
      })
      .onConflictDoNothing();
    return updated;
  }
}
