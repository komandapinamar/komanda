"use client";

import type {
  CreatePaymentSessionPayload,
  PaymentSession,
} from "@/types/types";

type PaymentSessionApiResponse = {
  paymentId?: string;
  preferenceId?: string;
  initPoint?: string;
  sandboxInitPoint?: string;
  cartId?: string;
  amount?: number | string;
  currency?: string;
  error?: string;
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function createPaymentSession(
  payload: CreatePaymentSessionPayload,
): Promise<PaymentSession> {
  const response = await fetch("/api/payments/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as PaymentSessionApiResponse;

  if (!response.ok) {
    throw new Error(
      data.error || `Payment session request failed with status ${response.status}`,
    );
  }

  const paymentId = String(data.paymentId ?? "");
  const preferenceId = String(data.preferenceId ?? "");
  const initPoint = String(data.initPoint ?? "");
  const cartId = String(data.cartId ?? "");

  if (!paymentId || !preferenceId || !initPoint || !cartId) {
    throw new Error("Payment session response is missing required fields.");
  }

  return {
    paymentId,
    preferenceId,
    initPoint,
    sandboxInitPoint: data.sandboxInitPoint,
    cartId,
    amount: toNumber(data.amount),
    currency: String(data.currency ?? "ARS"),
  };
}
