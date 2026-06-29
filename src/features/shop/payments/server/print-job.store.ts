import "server-only";

import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { printJobs } from "@/db/schema";
import type { PrintJobPayload } from "@/types/types";

type PrintJobRecord = typeof printJobs.$inferSelect;

type CreatePrintJobInput = {
  checkoutPaymentId: string;
  orderId: string;
  cartId: string;
  paymentId: string;
  idempotencyKey: string;
  payload: PrintJobPayload;
};

const DEFAULT_PRINT_MAX_ATTEMPTS = 5;
const DEFAULT_PRINT_RETRY_BASE_SECONDS = 15;

function getPrintMaxAttempts() {
  const value = Number(process.env.PRINT_SERVICE_MAX_ATTEMPTS ?? DEFAULT_PRINT_MAX_ATTEMPTS);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_PRINT_MAX_ATTEMPTS;
}

function getPrintRetryBaseSeconds() {
  const value = Number(
    process.env.PRINT_SERVICE_RETRY_BASE_SECONDS ?? DEFAULT_PRINT_RETRY_BASE_SECONDS,
  );
  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_PRINT_RETRY_BASE_SECONDS;
}

function serializePrintJob(record: PrintJobRecord) {
  return {
    ...record,
    payload: record.payload as PrintJobPayload,
  };
}

function getNextRetryDate(attemptCount: number) {
  const delaySeconds = getPrintRetryBaseSeconds() * 2 ** Math.max(attemptCount - 1, 0);
  return new Date(Date.now() + delaySeconds * 1000);
}

export async function getPrintJobById(id: string) {
  const [record] = await db.select().from(printJobs).where(eq(printJobs.id, id)).limit(1);
  return record ? serializePrintJob(record) : null;
}

export async function createPrintJob(input: CreatePrintJobInput) {
  const now = new Date();
  const [inserted] = await db
    .insert(printJobs)
    .values({
      id: crypto.randomUUID(),
      checkoutPaymentId: input.checkoutPaymentId,
      orderId: input.orderId,
      cartId: input.cartId,
      paymentId: input.paymentId,
      idempotencyKey: input.idempotencyKey,
      status: "pending",
      payload: input.payload,
      attemptCount: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: printJobs.idempotencyKey,
    })
    .returning();

  if (inserted) {
    return serializePrintJob(inserted);
  }

  const [existing] = await db
    .select()
    .from(printJobs)
    .where(eq(printJobs.idempotencyKey, input.idempotencyKey))
    .limit(1);

  return existing ? serializePrintJob(existing) : null;
}

export async function claimNextPrintJob() {
  const now = new Date();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [candidate] = await db
      .select()
      .from(printJobs)
      .where(
        and(
          inArray(printJobs.status, ["pending", "failed"]),
          isNotNull(printJobs.nextAttemptAt),
          lte(printJobs.nextAttemptAt, now),
        ),
      )
      .orderBy(asc(printJobs.nextAttemptAt), asc(printJobs.createdAt))
      .limit(1);

    if (!candidate) {
      return null;
    }

    const [claimed] = await db
      .update(printJobs)
      .set({
        status: "processing",
        attemptCount: candidate.attemptCount + 1,
        claimedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(printJobs.id, candidate.id),
          eq(printJobs.status, candidate.status),
          eq(printJobs.attemptCount, candidate.attemptCount),
        ),
      )
      .returning();

    if (claimed) {
      return serializePrintJob(claimed);
    }
  }

  return null;
}

export async function markPrintJobPrinted(id: string) {
  const now = new Date();
  const [record] = await db
    .update(printJobs)
    .set({
      status: "printed",
      claimedAt: null,
      nextAttemptAt: null,
      printedAt: now,
      lastError: null,
      updatedAt: now,
    })
    .where(eq(printJobs.id, id))
    .returning();

  return record ? serializePrintJob(record) : null;
}

export async function markPrintJobFailed(id: string, error: string) {
  const job = await getPrintJobById(id);

  if (!job) {
    return null;
  }

  const now = new Date();
  const willRetry = job.attemptCount < getPrintMaxAttempts();
  const [record] = await db
    .update(printJobs)
    .set({
      status: "failed",
      claimedAt: null,
      nextAttemptAt: willRetry ? getNextRetryDate(job.attemptCount) : null,
      lastError: error,
      updatedAt: now,
    })
    .where(eq(printJobs.id, id))
    .returning();

  return record
    ? {
        job: serializePrintJob(record),
        willRetry,
      }
    : null;
}
