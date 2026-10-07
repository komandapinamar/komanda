"use client";

import type { CreateCashOrderResponse } from "@/features/orders/domain/cash-order.schemas";

export type CreateCashOrderPayload = {
  cartId: string;
  customer: {
    name: string;
    phone?: string;
  };
  notes?: string;
  cartVersion?: number;
  idempotencyKey?: string;
};

export async function createCashOrder(
  tenantSlug: string,
  payload: CreateCashOrderPayload,
): Promise<CreateCashOrderResponse> {
  const idempotencyKey = payload.idempotencyKey || crypto.randomUUID();
  const response = await fetch(
    `/api/v1/storefronts/${encodeURIComponent(tenantSlug)}/carts/${encodeURIComponent(payload.cartId)}/cash-orders`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        customer: {
          name: payload.customer.name.trim(),
          phone: payload.customer.phone?.trim() || undefined,
        },
        notes: payload.notes?.trim() || undefined,
        cartVersion: payload.cartVersion,
      }),
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.detail ||
        data.message ||
        data.error ||
        data.title ||
        data.code ||
        `Cash order creation failed with status ${response.status}`,
    );
  }

  return data as CreateCashOrderResponse;
}
