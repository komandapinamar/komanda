import "server-only";

import {
  buildOrderRequestIdempotencyKey,
  createOrder,
  getOrderById,
} from "@/features/shop/checkout/server/order.service";
import { createPrintJob } from "@/features/shop/payments/server/print-job.store";
import {
  createCheckoutPaymentAttempt,
  getProcessedCheckoutPaymentForCart,
  updateCheckoutPaymentAttempt,
} from "@/features/shop/payments/server/payment.store";
import type {
  CheckoutPaymentPrintStatus,
  CustomerInfo,
  OfficialCart,
  PrintJobPayload,
  PrintJobStatus,
} from "@/types/types";

type CreateAdminDirectOrderInput = {
  adminUsername: string;
  cart: OfficialCart;
  customer: CustomerInfo;
  notes?: string;
};

export type AdminDirectOrderResult = {
  paymentId: string;
  preferenceId: string;
  orderId: string;
  purchaseNumber: string;
  printJobId: string | null;
  printStatus: CheckoutPaymentPrintStatus;
  customerName: string;
};

function buildAdminPaymentId(checkoutPaymentId: string) {
  return `admin-direct:${checkoutPaymentId}`;
}

function buildAdminPreferenceId(checkoutPaymentId: string) {
  return `admin-direct:${checkoutPaymentId}`;
}

function buildPrintJobIdempotencyKey(orderId: string) {
  return `order:${orderId}:kitchen-ticket`;
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
  customer: CustomerInfo;
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
    source: "admin-direct",
    copies: 2,
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

export async function createAdminDirectOrder(
  input: CreateAdminDirectOrderInput,
): Promise<AdminDirectOrderResult> {
  const existingAttempt = await getProcessedCheckoutPaymentForCart(input.cart.id);

  if (
    existingAttempt?.orderId &&
    existingAttempt.paymentId &&
    existingAttempt.preferenceId
  ) {
    const existingOrder = await getOrderById(existingAttempt.orderId);

    return {
      paymentId: existingAttempt.paymentId,
      preferenceId: existingAttempt.preferenceId,
      orderId: existingAttempt.orderId,
      purchaseNumber: existingOrder?.purchaseNumber ?? existingAttempt.orderId,
      printJobId: existingAttempt.printJobId ?? null,
      printStatus: existingAttempt.printStatus,
      customerName: existingAttempt.customer.name,
    };
  }

  const checkoutPaymentId = crypto.randomUUID();
  const paymentId = buildAdminPaymentId(checkoutPaymentId);
  const preferenceId = buildAdminPreferenceId(checkoutPaymentId);
  const approvedAt = new Date();
  const orderRequestIdempotencyKey = buildOrderRequestIdempotencyKey(
    checkoutPaymentId,
  );
  const rawPayload = {
    source: "admin-direct",
    adminUsername: input.adminUsername,
    bypassedGateway: true,
  } as Record<string, unknown>;

  await createCheckoutPaymentAttempt({
    id: checkoutPaymentId,
    cartId: input.cart.id,
    preferenceId,
    customer: input.customer,
    notes: input.notes,
    amount: input.cart.total,
    currency: input.cart.currency,
  });

  try {
    const order = await createOrder({
      cartId: input.cart.id,
      customer: input.customer,
      notes: input.notes,
      metadata: {
        checkoutPaymentId,
        paymentId,
        preferenceId,
        orderRequestIdempotencyKey,
        approvedAt: approvedAt.toISOString(),
        source: "admin-direct",
      },
    });

    await updateCheckoutPaymentAttempt(checkoutPaymentId, {
      paymentId,
      preferenceId,
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
        checkoutPaymentId,
        orderId: order.id,
        cartId: input.cart.id,
        paymentId,
        idempotencyKey: buildPrintJobIdempotencyKey(order.id),
        payload: buildPrintJobPayload({
          orderId: order.id,
          purchaseNumber: order.purchaseNumber,
          checkoutPaymentId,
          paymentId,
          preferenceId,
          cart: input.cart,
          customer: input.customer,
          notes: input.notes,
          approvedAt,
        }),
      });

      if (printJob) {
        printJobId = printJob.id;
        printStatus = mapPrintJobStatus(printJob.status);

        await updateCheckoutPaymentAttempt(checkoutPaymentId, {
          printJobId,
          printStatus,
          printRequestedAt: approvedAt,
          printCompletedAt: printJob.printedAt ?? null,
          lastPrintError: printJob.lastError ?? null,
        });
      }
    } catch (printError) {
      printStatus = "failed";

      await updateCheckoutPaymentAttempt(checkoutPaymentId, {
        printStatus,
        printRequestedAt: approvedAt,
        lastPrintError: toErrorMessage(printError),
      });

      console.error("[admin-direct-order] Failed to enqueue print job.", {
        checkoutPaymentId,
        orderId: order.id,
        paymentId,
        error: printError,
      });
    }

    return {
      paymentId,
      preferenceId,
      orderId: order.id,
      purchaseNumber: order.purchaseNumber,
      printJobId,
      printStatus,
      customerName: input.customer.name,
    };
  } catch (error) {
    await updateCheckoutPaymentAttempt(checkoutPaymentId, {
      paymentId,
      preferenceId,
      status: "failed",
      processedAt: null,
      rawPayload,
    });

    throw error;
  }
}
