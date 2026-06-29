import "server-only";

import { getOfficialCartById } from "@/features/shop/cart/server/cart.store";
import {
  buildOrderRequestIdempotencyKey,
  createOrder,
  getOrderById,
} from "@/features/shop/checkout/server/order.service";
import { getMercadoPagoPayment } from "@/features/shop/payments/server/mercadopago.service";
import { createPrintJob } from "@/features/shop/payments/server/print-job.store";
import {
  claimCheckoutPaymentAttempt,
  getActiveCheckoutPaymentForCart,
  getCheckoutPaymentAttemptById,
  getCheckoutPaymentAttemptByPaymentId,
  getLatestPendingCheckoutPaymentForCart,
  updateCheckoutPaymentAttempt,
} from "@/features/shop/payments/server/payment.store";
import type {
  CheckoutPaymentPrintStatus,
  CheckoutPaymentStatus,
  OfficialCart,
  PrintJobPayload,
  PrintJobStatus,
} from "@/types/types";

export type PaymentConfirmationResult =
  | {
      kind: "confirmed";
      paymentId: string;
      orderId: string;
      purchaseNumber: string;
      customerName: string;
      cartId: string;
      printJobId: string | null;
      printStatus: CheckoutPaymentPrintStatus;
    }
  | {
      kind: "already_confirmed";
      paymentId: string;
      orderId: string;
      purchaseNumber: string;
      customerName: string;
    }
  | {
      kind: "already_claimed";
      paymentId: string;
      customerName: string;
    }
  | {
      kind: "status_updated";
      paymentId: string;
      status: CheckoutPaymentStatus;
      customerName: string;
    }
  | {
      kind: "missing_attempt";
      paymentId: string;
      cartId: string | null;
      error: string;
      customerName?: string;
    }
  | {
      kind: "error";
      paymentId: string;
      error: string;
      customerName?: string;
    };

function mapMercadoPagoStatus(status: string | undefined): CheckoutPaymentStatus {
  switch (status) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "pending":
    case "in_process":
      return "pending";
    default:
      return "failed";
  }
}

function mapPrintJobStatus(status: PrintJobStatus): CheckoutPaymentPrintStatus {
  switch (status) {
    case "pending":
      return "queued";
    case "processing":
      return "processing";
    case "printed":
      return "printed";
    case "failed":
    default:
      return "failed";
  }
}

function buildPrintJobIdempotencyKey(orderId: string) {
  return `order:${orderId}:kitchen-ticket`;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected print queue error.";
}

function buildPrintJobPayload(input: {
  orderId: string;
  purchaseNumber: string;
  checkoutPaymentId: string;
  paymentId: string;
  preferenceId: string;
  cart: OfficialCart;
  customer: PrintJobPayload["customer"];
  notes?: string;
  approvedAt: Date;
}): PrintJobPayload {
  return {
    orderId: input.orderId,
    purchaseNumber: input.purchaseNumber,
    cartId: input.cart.id,
    checkoutPaymentId: input.checkoutPaymentId,
    paymentId: input.paymentId,
    preferenceId: input.preferenceId,
    source: "mercadopago-webhook",
    copies: 1,
    customer: input.customer,
    notes: input.notes,
    currency: input.cart.currency,
    amount: input.cart.total,
    approvedAt: input.approvedAt.toISOString(),
    items: input.cart.items,
    summary: {
      subtotal: input.cart.subtotal,
      discountTotal: input.cart.discountTotal,
      total: input.cart.total,
    },
  };
}

export async function confirmMercadoPagoPaymentById(
  paymentId: string,
): Promise<PaymentConfirmationResult> {
  const normalizedPaymentId = paymentId.trim();

  if (!normalizedPaymentId) {
    return {
      kind: "error",
      paymentId: "",
      error: "Missing Mercado Pago payment id.",
    };
  }

  const payment = await getMercadoPagoPayment(normalizedPaymentId);
  const paymentRecordId = String(payment.id);
  const paymentMetadata = payment.metadata as Record<string, unknown> | undefined;
  const cartId = String(payment.external_reference ?? paymentMetadata?.cartId ?? "");
  const checkoutPaymentId = String(paymentMetadata?.checkoutPaymentId ?? "");
  const normalizedStatus = mapMercadoPagoStatus(payment.status);
  const rawPayload = {
    source: "checkout-pay-success-page",
    payment,
  } as Record<string, unknown>;

  const existingAttemptByPaymentId = await getCheckoutPaymentAttemptByPaymentId(paymentRecordId);
  const existingCustomerName = existingAttemptByPaymentId?.customer.name;

  if (existingAttemptByPaymentId?.orderId) {
    const existingOrder = await getOrderById(existingAttemptByPaymentId.orderId);

    return {
      kind: "already_confirmed",
      paymentId: paymentRecordId,
      orderId: existingAttemptByPaymentId.orderId,
      purchaseNumber: existingOrder?.purchaseNumber ?? existingAttemptByPaymentId.orderId,
      customerName: existingCustomerName ?? "Cliente",
    };
  }

  const attemptFromMetadata = checkoutPaymentId
    ? await getCheckoutPaymentAttemptById(checkoutPaymentId)
    : null;
  const attempt =
    existingAttemptByPaymentId ??
    attemptFromMetadata ??
    (cartId ? await getLatestPendingCheckoutPaymentForCart(cartId) : null);

  if (!attempt) {
    return {
      kind: "missing_attempt",
      paymentId: paymentRecordId,
      cartId: cartId || null,
      error: "No checkout payment attempt matches this Mercado Pago payment.",
    };
  }

  if (normalizedStatus !== "approved") {
    await updateCheckoutPaymentAttempt(attempt.id, {
      paymentId: paymentRecordId,
      status: normalizedStatus,
      processedAt: null,
      rawPayload,
    });

    return {
      kind: "status_updated",
      paymentId: paymentRecordId,
      status: normalizedStatus,
      customerName: attempt.customer.name,
    };
  }

  const activePaymentForCart = cartId ? await getActiveCheckoutPaymentForCart(cartId) : null;

  if (
    activePaymentForCart &&
    activePaymentForCart.id !== attempt.id &&
    (activePaymentForCart.status === "processing" || activePaymentForCart.orderId)
  ) {
    await updateCheckoutPaymentAttempt(attempt.id, {
      paymentId: paymentRecordId,
      status: "duplicate",
      processedAt: new Date(),
      rawPayload,
    });

    return {
      kind: "status_updated",
      paymentId: paymentRecordId,
      status: "duplicate",
      customerName: attempt.customer.name,
    };
  }

  const claimedAttempt = await claimCheckoutPaymentAttempt(attempt.id, {
    paymentId: paymentRecordId,
    rawPayload,
  });

  if (!claimedAttempt) {
    return {
      kind: "already_claimed",
      paymentId: paymentRecordId,
      customerName: attempt.customer.name,
    };
  }

  try {
    if (!cartId) {
      await updateCheckoutPaymentAttempt(claimedAttempt.id, {
        paymentId: paymentRecordId,
        status: "failed",
        processedAt: null,
        rawPayload,
      });

      return {
        kind: "error",
        paymentId: paymentRecordId,
        error: "Approved payment is missing external_reference/cartId.",
      };
    }

    const officialCart = await getOfficialCartById(cartId);

    if (!officialCart) {
      await updateCheckoutPaymentAttempt(claimedAttempt.id, {
        paymentId: paymentRecordId,
        status: "failed",
        processedAt: null,
        rawPayload,
      });

      return {
        kind: "error",
        paymentId: paymentRecordId,
        error: `Cart "${cartId}" was not found or has expired.`,
      };
    }

    const approvedAt = payment.date_approved ? new Date(payment.date_approved) : new Date();
    const resolvedPreferenceId = claimedAttempt.preferenceId;
    const orderRequestIdempotencyKey =
      claimedAttempt.orderRequestIdempotencyKey ||
      buildOrderRequestIdempotencyKey(claimedAttempt.id);

    const order = await createOrder({
      cartId: officialCart.id,
      customer: claimedAttempt.customer,
      notes: claimedAttempt.notes ?? undefined,
      metadata: {
        checkoutPaymentId: claimedAttempt.id,
        paymentId: paymentRecordId,
        preferenceId: resolvedPreferenceId,
        orderRequestIdempotencyKey,
        approvedAt: approvedAt.toISOString(),
        source: "mercadopago-webhook",
      },
    });

    await updateCheckoutPaymentAttempt(claimedAttempt.id, {
      paymentId: paymentRecordId,
      preferenceId: resolvedPreferenceId,
      status: "approved",
      orderId: order.id,
      orderRequestIdempotencyKey,
      processedAt: approvedAt,
      rawPayload,
      lastPrintError: null,
    });

    let printJobId: string | null = null;
    let printStatus: CheckoutPaymentPrintStatus = "not_requested";

    try {
      const printJob = await createPrintJob({
        checkoutPaymentId: claimedAttempt.id,
        orderId: order.id,
        cartId: officialCart.id,
        paymentId: paymentRecordId,
        idempotencyKey: buildPrintJobIdempotencyKey(order.id),
        payload: buildPrintJobPayload({
          orderId: order.id,
          purchaseNumber: order.purchaseNumber,
          checkoutPaymentId: claimedAttempt.id,
          paymentId: paymentRecordId,
          preferenceId: resolvedPreferenceId,
          cart: officialCart,
          customer: claimedAttempt.customer,
          notes: claimedAttempt.notes ?? undefined,
          approvedAt,
        }),
      });

      if (printJob) {
        printJobId = printJob.id;
        printStatus = mapPrintJobStatus(printJob.status);

        await updateCheckoutPaymentAttempt(claimedAttempt.id, {
          printJobId,
          printStatus,
          printRequestedAt: approvedAt,
          printCompletedAt: printJob.printedAt ?? null,
          lastPrintError: printJob.lastError ?? null,
        });
      }
    } catch (printError) {
      printStatus = "failed";

      await updateCheckoutPaymentAttempt(claimedAttempt.id, {
        printStatus,
        printRequestedAt: approvedAt,
        lastPrintError: toErrorMessage(printError),
      });

      console.error("[payments:confirm] Failed to enqueue print job.", {
        checkoutPaymentId: claimedAttempt.id,
        orderId: order.id,
        paymentId: paymentRecordId,
        error: printError,
      });
    }

    return {
      kind: "confirmed",
      paymentId: paymentRecordId,
      orderId: order.id,
      purchaseNumber: order.purchaseNumber,
      customerName: claimedAttempt.customer.name,
      cartId: officialCart.id,
      printJobId,
      printStatus,
    };
  } catch (error) {
    await updateCheckoutPaymentAttempt(claimedAttempt.id, {
      paymentId: paymentRecordId,
      status: "failed",
      processedAt: null,
      rawPayload,
    });

    return {
      kind: "error",
      paymentId: paymentRecordId,
      error: error instanceof Error ? error.message : "Unexpected payment confirmation error.",
    };
  }
}
