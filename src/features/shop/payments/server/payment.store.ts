import "server-only";

import { and, desc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { checkoutPayments } from "@/db/schema";
import type {
  CheckoutPaymentPrintStatus,
  CheckoutPaymentStatus,
  CreatePaymentSessionPayload,
} from "@/types/types";

type CheckoutPaymentRecord = typeof checkoutPayments.$inferSelect;

type CreateCheckoutPaymentAttemptInput = {
  id: string;
  cartId: string;
  preferenceId: string;
  customer: CreatePaymentSessionPayload["customer"];
  notes?: string;
  amount: number;
  currency: string;
  status?: CheckoutPaymentStatus;
};

type UpdateCheckoutPaymentAttemptInput = {
  paymentId?: string;
  preferenceId?: string;
  status?: CheckoutPaymentStatus;
  orderId?: string;
  orderRequestIdempotencyKey?: string;
  printJobId?: string | null;
  printStatus?: CheckoutPaymentPrintStatus;
  printRequestedAt?: Date | null;
  printCompletedAt?: Date | null;
  lastPrintError?: string | null;
  processedAt?: Date | null;
  rawPayload?: Record<string, unknown> | null;
};

function toNumber(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

function serializeCheckoutPayment(record: CheckoutPaymentRecord) {
  return {
    ...record,
    amount: toNumber(record.amount),
  };
}

export async function createCheckoutPaymentAttempt(
  input: CreateCheckoutPaymentAttemptInput,
) {
  const now = new Date();

  const [record] = await db
    .insert(checkoutPayments)
    .values({
      id: input.id,
      cartId: input.cartId,
      preferenceId: input.preferenceId,
      customer: input.customer,
      notes: input.notes,
      amount: input.amount.toFixed(2),
      currency: input.currency,
      status: input.status ?? "initiated",
      printStatus: "not_requested",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return serializeCheckoutPayment(record);
}

export async function getCheckoutPaymentAttemptById(id: string) {
  const [record] = await db
    .select()
    .from(checkoutPayments)
    .where(eq(checkoutPayments.id, id))
    .limit(1);

  return record ? serializeCheckoutPayment(record) : null;
}

export async function getCheckoutPaymentAttemptByPaymentId(paymentId: string) {
  const [record] = await db
    .select()
    .from(checkoutPayments)
    .where(eq(checkoutPayments.paymentId, paymentId))
    .orderBy(desc(checkoutPayments.createdAt))
    .limit(1);

  return record ? serializeCheckoutPayment(record) : null;
}

export async function getCheckoutPaymentAttemptByPreferenceId(preferenceId: string) {
  const [record] = await db
    .select()
    .from(checkoutPayments)
    .where(eq(checkoutPayments.preferenceId, preferenceId))
    .orderBy(desc(checkoutPayments.createdAt))
    .limit(1);

  return record ? serializeCheckoutPayment(record) : null;
}

export async function getProcessedCheckoutPaymentForCart(cartId: string) {
  const [record] = await db
    .select()
    .from(checkoutPayments)
    .where(and(eq(checkoutPayments.cartId, cartId), isNotNull(checkoutPayments.orderId)))
    .orderBy(desc(checkoutPayments.processedAt), desc(checkoutPayments.createdAt))
    .limit(1);

  return record ? serializeCheckoutPayment(record) : null;
}

export async function getActiveCheckoutPaymentForCart(cartId: string) {
  const [record] = await db
    .select()
    .from(checkoutPayments)
    .where(
      and(
        eq(checkoutPayments.cartId, cartId),
        inArray(checkoutPayments.status, ["processing", "approved"]),
      ),
    )
    .orderBy(desc(checkoutPayments.processedAt), desc(checkoutPayments.createdAt))
    .limit(1);

  return record ? serializeCheckoutPayment(record) : null;
}

export async function getLatestPendingCheckoutPaymentForCart(cartId: string) {
  const [record] = await db
    .select()
    .from(checkoutPayments)
    .where(and(eq(checkoutPayments.cartId, cartId), isNull(checkoutPayments.orderId)))
    .orderBy(desc(checkoutPayments.createdAt))
    .limit(1);

  return record ? serializeCheckoutPayment(record) : null;
}

export async function updateCheckoutPaymentAttempt(
  id: string,
  input: UpdateCheckoutPaymentAttemptInput,
) {
  const now = new Date();
  const [record] = await db
    .update(checkoutPayments)
    .set({
      paymentId: input.paymentId,
      preferenceId: input.preferenceId,
      status: input.status,
      orderId: input.orderId,
      orderRequestIdempotencyKey: input.orderRequestIdempotencyKey,
      printJobId: input.printJobId,
      printStatus: input.printStatus,
      printRequestedAt: input.printRequestedAt,
      printCompletedAt: input.printCompletedAt,
      lastPrintError: input.lastPrintError,
      processedAt: input.processedAt,
      rawPayload: input.rawPayload,
      updatedAt: now,
    })
    .where(eq(checkoutPayments.id, id))
    .returning();


  return record ? serializeCheckoutPayment(record) : null;
}

export async function claimCheckoutPaymentAttempt(
  id: string,
  input: Pick<UpdateCheckoutPaymentAttemptInput, "paymentId" | "rawPayload">,
) {
  const now = new Date();
  const [record] = await db
    .update(checkoutPayments)
    .set({
      paymentId: input.paymentId,
      status: "processing",
      processedAt: now,
      rawPayload: input.rawPayload,
      updatedAt: now,
    })
    .where(
      and(
        eq(checkoutPayments.id, id),
        isNull(checkoutPayments.orderId),
        ne(checkoutPayments.status, "processing"),
        ne(checkoutPayments.status, "approved"),
      ),
    )
    .returning();

  return record ? serializeCheckoutPayment(record) : null;
}
