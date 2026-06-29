import "server-only";

import { randomInt } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import type {
  AdminDashboardOrder,
  CreateOrderPayload,
  CreatedOrder,
  CustomerInfo,
  OrderSource,
  OrderRequestMetadata,
} from "@/types/types";

type OrderRecord = typeof orders.$inferSelect;

function pad(value: number) {
  return value.toString().padStart(2, "0");
}

function buildPurchaseNumber(date = new Date()) {
  const prefix = [
    date.getFullYear().toString().slice(-2),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");

  return `${prefix}${randomInt(100, 1000)}`;
}

function parseOrderMetadata(
  metadata: OrderRecord["metadata"],
): OrderRequestMetadata | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  return metadata as OrderRequestMetadata;
}

function fallbackPurchaseNumber(orderId: string) {
  const digits = orderId.replace(/\D/g, "");
  return digits.slice(-6).padStart(6, "0");
}

function getPurchaseNumber(record: OrderRecord) {
  const purchaseNumber = parseOrderMetadata(record.metadata)?.purchaseNumber?.trim();
  return purchaseNumber || fallbackPurchaseNumber(record.id);
}

function serializeCreatedOrder(record: OrderRecord): CreatedOrder {
  return {
    id: record.id,
    purchaseNumber: getPurchaseNumber(record),
    status: record.status,
  };
}

function serializeAdminDashboardOrder(record: OrderRecord): AdminDashboardOrder {
  return {
    id: record.id,
    purchaseNumber: getPurchaseNumber(record),
    status: record.status,
    customer: record.customer as CustomerInfo,
    notes: record.notes ?? null,
    source:
      parseOrderMetadata(record.metadata)?.source ??
      ((record.source as OrderSource | null | undefined) ?? null),
    approvedAt: record.approvedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

async function getExistingOrderByIdempotencyKey(idempotencyKey: string) {
  const [existing] = await db
    .select()
    .from(orders)
    .where(eq(orders.idempotencyKey, idempotencyKey))
    .limit(1);

  return existing ?? null;
}

export function buildOrderRequestIdempotencyKey(checkoutPaymentId: string) {
  return `checkout-payment:${checkoutPaymentId}`;
}

export async function getOrderById(id: string) {
  const [record] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return record ? serializeAdminDashboardOrder(record) : null;
}

export async function listOrdersInProgress() {
  const records = await db
    .select()
    .from(orders)
    .where(eq(orders.status, "approved"))
    .orderBy(desc(orders.approvedAt), desc(orders.createdAt));

  return records.map(serializeAdminDashboardOrder);
}

export async function markOrderAsDelivered(orderId: string) {
  const now = new Date();
  const [record] = await db
    .update(orders)
    .set({
      status: "delivered",
      updatedAt: now,
    })
    .where(and(eq(orders.id, orderId), eq(orders.status, "approved")))
    .returning();

  return record ? serializeAdminDashboardOrder(record) : null;
}

export async function createOrder(
  payload: CreateOrderPayload,
): Promise<CreatedOrder> {
  const now = new Date();
  const idempotencyKey = payload.metadata?.orderRequestIdempotencyKey ?? null;
  const approvedAt = payload.metadata?.approvedAt
    ? new Date(payload.metadata.approvedAt)
    : null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const purchaseNumber = payload.metadata?.purchaseNumber ?? buildPurchaseNumber();
    const metadata: OrderRequestMetadata | null = payload.metadata
      ? {
          ...payload.metadata,
          purchaseNumber,
        }
      : null;

    const [inserted] = await db
      .insert(orders)
      .values({
        id: crypto.randomUUID(),
        cartId: payload.cartId,
        customer: payload.customer,
        notes: payload.notes,
        status: "approved",
        idempotencyKey,
        checkoutPaymentId: payload.metadata?.checkoutPaymentId ?? null,
        paymentId: payload.metadata?.paymentId ?? null,
        preferenceId: payload.metadata?.preferenceId ?? null,
        source: payload.metadata?.source ?? null,
        approvedAt,
        metadata,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: orders.idempotencyKey,
      })
      .returning();

    if (inserted) {
      return serializeCreatedOrder(inserted);
    }

    if (!idempotencyKey) {
      break;
    }

    const existing = await getExistingOrderByIdempotencyKey(idempotencyKey);

    if (existing) {
      return serializeCreatedOrder(existing);
    }
  }

  if (!idempotencyKey) {
    throw new Error("Order insert did not return a record and no idempotency key was provided.");
  }

  const existing = await getExistingOrderByIdempotencyKey(idempotencyKey);

  if (!existing) {
    throw new Error(`Order with idempotency key "${idempotencyKey}" was not found.`);
  }

  return serializeCreatedOrder(existing);
}
