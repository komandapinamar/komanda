"use client";

import type {
  CreatePaymentSessionPayload,
  PaymentSession,
} from "@/types/types";

type PaymentSessionApiResponse = {
  paymentId?: string;
  paymentAttemptId?: string;
  preferenceId?: string;
  initPoint?: string;
  redirectUrl?: string;
  sandboxInitPoint?: string;
  sandboxRedirectUrl?: string;
  cartId?: string;
  amount?: number | string;
  currency?: string;
  error?: string;
  title?: string;
  detail?: string;
  code?: string;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function createPaymentSession(
  tenantSlug: string,
  payload: CreatePaymentSessionPayload,
): Promise<PaymentSession> {
  const response = await fetch(
    `/api/v1/storefronts/${tenantSlug}/carts/${payload.cartId}/payment-sessions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        customer: payload.customer,
        notes: payload.notes,
        cartVersion: payload.cartVersion,
      }),
    },
  );

  const data = (await response.json()) as PaymentSessionApiResponse;

  if (!response.ok) {
    throw new Error(
      data.error ||
        data.detail ||
        data.title ||
        data.code ||
        `Payment session request failed with status ${response.status}`,
    );
  }

  const paymentId = String(data.paymentAttemptId ?? "");
  const preferenceId = String(data.preferenceId ?? "");
  const initPoint = String(data.redirectUrl ?? "");
  const cartId = String(data.cartId ?? payload.cartId ?? "");

  if (!paymentId || !preferenceId || !initPoint || !cartId) {
    throw new Error("Payment session response is missing required fields.");
  }

  return {
    paymentId,
    preferenceId,
    initPoint,
    sandboxInitPoint: data.sandboxRedirectUrl,
    cartId,
    amount: toNumber(data.amount),
    currency: String(data.currency ?? "ARS"),
  };
}
