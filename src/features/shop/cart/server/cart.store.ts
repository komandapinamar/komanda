import "server-only";

import { and, eq, gt, lte } from "drizzle-orm";
import { db } from "@/db";
import { temporaryCarts } from "@/db/schema";
import type { OfficialCart } from "@/types/types";

// have this env var set to 60 minutes by default, change it to whatever you want
const DEFAULT_CART_TTL_MINUTES = 60;
const DEFAULT_CART_CLEANUP_INTERVAL_MINUTES = 10;

let lastExpiredCartCleanupAt = 0;

function getCartTtlMinutes() {
  const parsedValue = Number(process.env.CART_TTL_MINUTES ?? DEFAULT_CART_TTL_MINUTES);
  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : DEFAULT_CART_TTL_MINUTES;
}

function getCartCleanupIntervalMinutes() {
  const parsedValue = Number(
    process.env.CART_CLEANUP_INTERVAL_MINUTES ?? DEFAULT_CART_CLEANUP_INTERVAL_MINUTES,
  );

  return Number.isFinite(parsedValue) && parsedValue > 0
    ? parsedValue
    : DEFAULT_CART_CLEANUP_INTERVAL_MINUTES;
}

function toNumber(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

function serializeCart(record: typeof temporaryCarts.$inferSelect): OfficialCart {
  return {
    id: record.id,
    currency: record.currency,
    items: record.items,
    subtotal: toNumber(record.subtotal),
    discountTotal: toNumber(record.discountTotal),
    total: toNumber(record.total),
    updatedAt: record.updatedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
  };
}

// only cleans up when DEFAULT_CART_CLEANUP_INTERVAL_MINUTES minutes have passed since the last cleanup
// this const is hardcoded to 10 minutes, change it to whatever
async function cleanupExpiredCartsIfNeeded() {
  const now = Date.now();
  const cleanupIntervalMs = getCartCleanupIntervalMinutes() * 60 * 1000;

  if (now - lastExpiredCartCleanupAt < cleanupIntervalMs) {
    return;
  }

  lastExpiredCartCleanupAt = now;

  try {
    await db
      .delete(temporaryCarts)
      .where(lte(temporaryCarts.expiresAt, new Date(now)));
  } catch (error) {
    console.error("Failed to cleanup expired carts.", error);
  }
}

export async function saveOfficialCart(cart: OfficialCart) {
  await cleanupExpiredCartsIfNeeded();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + getCartTtlMinutes() * 60 * 1000);

  await db
    .insert(temporaryCarts)
    .values({
      id: cart.id,
      currency: cart.currency,
      items: cart.items,
      subtotal: cart.subtotal.toFixed(2),
      discountTotal: cart.discountTotal.toFixed(2),
      total: cart.total.toFixed(2),
      verifiedAt: now,
      expiresAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: temporaryCarts.id,
      set: {
        currency: cart.currency,
        items: cart.items,
        subtotal: cart.subtotal.toFixed(2),
        discountTotal: cart.discountTotal.toFixed(2),
        total: cart.total.toFixed(2),
        verifiedAt: now,
        expiresAt,
        updatedAt: now,
      },
    });

  return {
    ...cart,
    updatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getOfficialCartById(cartId: string) {
  await cleanupExpiredCartsIfNeeded();

  const [cart] = await db
    .select()
    .from(temporaryCarts)
    .where(and(eq(temporaryCarts.id, cartId), gt(temporaryCarts.expiresAt, new Date())))
    .limit(1);

  return cart ? serializeCart(cart) : null;
}
