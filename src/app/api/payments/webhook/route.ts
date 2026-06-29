import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { getOfficialCartById } from "@/features/shop/cart/server/cart.store";
import {
  buildOrderRequestIdempotencyKey,
  createOrder,
} from "@/features/shop/checkout/server/order.service";
import {
  getMercadoPagoMerchantOrder,
  getMercadoPagoPayment,
  type MercadoPagoMerchantOrder,
} from "@/features/shop/payments/server/mercadopago.service";
import { createPrintJob } from "@/features/shop/payments/server/print-job.store";
import {
  claimCheckoutPaymentAttempt,
  getActiveCheckoutPaymentForCart,
  getCheckoutPaymentAttemptById,
  getCheckoutPaymentAttemptByPaymentId,
  getCheckoutPaymentAttemptByPreferenceId,
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

export const runtime = "nodejs";
export const revalidate = 0;

const PAYMENT_TOPICS = new Set(["payment"]);
const MERCHANT_ORDER_TOPICS = new Set(["merchant_order", "topic_merchant_order_wh"]);

type MercadoPagoWebhookPayload = {
  action?: string;
  type?: string;
  topic?: string;
  data?: {
    id?: string | number;
  };
};

type MercadoPagoWebhookSignature = {
  ts: string;
  v1: string;
};

type SignatureVerificationResult = {
  enabled: boolean;
  valid: boolean;
  reason?: string;
};

function normalizeTopic(payload: MercadoPagoWebhookPayload, request: Request) {
  const url = new URL(request.url);

  return ((
    payload.type ??
    payload.topic ??
    url.searchParams.get("type") ??
    url.searchParams.get("topic") ??
    ""
  ) as string)
    .trim()
    .toLowerCase();
}

function normalizeNotificationResourceId(payload: MercadoPagoWebhookPayload, request: Request) {
  const url = new URL(request.url);

  return payload.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? null;
}

function parsePayload(rawText: string): MercadoPagoWebhookPayload {
  if (!rawText) {
    return {};
  }

  try {
    return JSON.parse(rawText) as MercadoPagoWebhookPayload;
  } catch {
    return {};
  }
}

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

function toRawPayload(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : { value };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected print queue error.";
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

function isPaymentTopic(topic: string) {
  return PAYMENT_TOPICS.has(topic);
}

function isMerchantOrderTopic(topic: string) {
  return MERCHANT_ORDER_TOPICS.has(topic);
}

function parseSignatureHeader(value: string | null): MercadoPagoWebhookSignature | null {
  if (!value) {
    return null;
  }

  let ts = "";
  let v1 = "";

  for (const part of value.split(",")) {
    const [key, rawPartValue] = part.split("=", 2);

    if (!key || !rawPartValue) {
      continue;
    }

    const normalizedKey = key.trim().toLowerCase();
    const normalizedValue = rawPartValue.trim();

    if (normalizedKey === "ts") {
      ts = normalizedValue;
    }

    if (normalizedKey === "v1") {
      v1 = normalizedValue.toLowerCase();
    }
  }

  return ts && v1 ? { ts, v1 } : null;
}

function buildSignatureManifest(request: Request, ts: string) {
  const url = new URL(request.url);
  const dataId = url.searchParams.get("data.id")?.trim().toLowerCase();
  const requestId = request.headers.get("x-request-id")?.trim();
  const parts: string[] = [];

  if (dataId) {
    parts.push(`id:${dataId}`);
  }

  if (requestId) {
    parts.push(`request-id:${requestId}`);
  }

  if (ts) {
    parts.push(`ts:${ts}`);
  }

  return parts.map((part) => `${part};`).join("");
}

function verifyWebhookSignature(
  request: Request,
): SignatureVerificationResult {
  const secret = process.env.MP_WEBHOOK_SECRET?.trim();

  if (!secret) {
    return {
      enabled: false,
      valid: true,
    };
  }

  const signature = parseSignatureHeader(request.headers.get("x-signature"));

  if (!signature) {
    return {
      enabled: true,
      valid: false,
      reason: "Missing or invalid x-signature header.",
    };
  }

  const manifest = buildSignatureManifest(request, signature.ts);

  if (!manifest) {
    return {
      enabled: true,
      valid: false,
      reason: "Missing data required to validate Mercado Pago webhook signature.",
    };
  }

  if (!new URL(request.url).searchParams.get("data.id")?.trim()) {
    return {
      enabled: true,
      valid: false,
      reason: "Missing data.id query param required by Mercado Pago webhook signature validation.",
    };
  }

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const actual = signature.v1;
  const valid = expected === actual;

  return valid
    ? {
        enabled: true,
        valid: true,
      }
    : {
        enabled: true,
        valid: false,
        reason: "Mercado Pago webhook signature validation failed.",
      };
}

function paymentStatusPriority(status: string | undefined) {
  switch (status) {
    case "approved":
      return 3;
    case "pending":
    case "in_process":
      return 2;
    case "authorized":
      return 1;
    default:
      return 0;
  }
}

function paymentTimestamp(payment: {
  date_approved?: string;
  last_modified?: string;
  date_created?: string;
}) {
  const value = payment.date_approved ?? payment.last_modified ?? payment.date_created;
  return value ? Date.parse(value) || 0 : 0;
}

function pickBestMerchantOrderPayment(merchantOrder: MercadoPagoMerchantOrder) {
  const payments = (merchantOrder.payments ?? []).filter(
    (payment): payment is NonNullable<MercadoPagoMerchantOrder["payments"]>[number] & {
      id: string | number;
    } => payment.id !== undefined && payment.id !== null,
  );

  payments.sort((left, right) => {
    const statusDifference =
      paymentStatusPriority(right.status) - paymentStatusPriority(left.status);

    if (statusDifference !== 0) {
      return statusDifference;
    }

    return paymentTimestamp(right) - paymentTimestamp(left);
  });

  return payments[0] ?? null;
}

async function resolvePaymentFromNotification(
  topic: string,
  resourceId: string | number | null,
) {
  if (!resourceId) {
    return {
      payment: null,
      merchantOrder: null,
    };
  }

  if (isPaymentTopic(topic)) {
    return {
      payment: await getMercadoPagoPayment(resourceId),
      merchantOrder: null,
    };
  }

  if (isMerchantOrderTopic(topic)) {
    const merchantOrder = await getMercadoPagoMerchantOrder(resourceId);
    const paymentSummary = pickBestMerchantOrderPayment(merchantOrder);

    if (!paymentSummary?.id) {
      return {
        payment: null,
        merchantOrder,
      };
    }

    return {
      payment: await getMercadoPagoPayment(paymentSummary.id),
      merchantOrder,
    };
  }

  return {
    payment: null,
    merchantOrder: null,
  };
}

async function syncPaymentAttemptFromMercadoPago(params: {
  notification: MercadoPagoWebhookPayload;
  payment: Awaited<ReturnType<typeof getMercadoPagoPayment>>;
  merchantOrder?: MercadoPagoMerchantOrder | null;
  topic: string;
  resourceId: string | number | null;
  signatureVerified: boolean;
}) {
  const paymentId = String(params.payment.id);
  const paymentMetadata = params.payment.metadata as Record<string, unknown> | undefined;
  const cartId = String(
    params.payment.external_reference ??
      params.merchantOrder?.external_reference ??
      (paymentMetadata?.cartId ?? ""),
  );
  const checkoutPaymentId = String(paymentMetadata?.checkoutPaymentId ?? "");
  const preferenceId = String(params.merchantOrder?.preference_id ?? "");
  const normalizedStatus = mapMercadoPagoStatus(params.payment.status);
  const rawPayload = {
    notification: params.notification,
    topic: params.topic,
    resourceId: params.resourceId,
    signatureVerified: params.signatureVerified,
    payment: params.payment,
    merchantOrder: params.merchantOrder ?? null,
  } as Record<string, unknown>;

  const existingAttemptByPaymentId = await getCheckoutPaymentAttemptByPaymentId(paymentId);

  if (existingAttemptByPaymentId?.orderId) {
    return NextResponse.json({
      ok: true,
      alreadyProcessed: true,
      orderId: existingAttemptByPaymentId.orderId,
      paymentId,
    });
  }

  const attemptFromMetadata = checkoutPaymentId
    ? await getCheckoutPaymentAttemptById(checkoutPaymentId)
    : null;
  const attemptFromPreferenceId = preferenceId
    ? await getCheckoutPaymentAttemptByPreferenceId(preferenceId)
    : null;
  const attempt =
    existingAttemptByPaymentId ??
    attemptFromMetadata ??
    attemptFromPreferenceId ??
    (cartId ? await getLatestPendingCheckoutPaymentForCart(cartId) : null);

  if (!attempt) {
    return NextResponse.json({
      ok: false,
      acknowledged: true,
      error: "No checkout payment attempt matches this Mercado Pago payment.",
      paymentId,
      cartId: cartId || null,
      preferenceId: preferenceId || null,
    });
  }

  if (normalizedStatus !== "approved") {
    await updateCheckoutPaymentAttempt(attempt.id, {
      paymentId,
      preferenceId: preferenceId || attempt.preferenceId,
      status: normalizedStatus,
      processedAt: null,
      rawPayload,
    });

    return NextResponse.json({
      ok: true,
      paymentId,
      status: normalizedStatus,
    });
  }

  const activePaymentForCart = cartId ? await getActiveCheckoutPaymentForCart(cartId) : null;

  if (
    activePaymentForCart &&
    activePaymentForCart.id !== attempt.id &&
    (activePaymentForCart.status === "processing" || activePaymentForCart.orderId)
  ) {
    await updateCheckoutPaymentAttempt(attempt.id, {
      paymentId,
      preferenceId: preferenceId || attempt.preferenceId,
      status: "duplicate",
      processedAt: new Date(),
      rawPayload,
    });

    return NextResponse.json({
      ok: true,
      duplicate: true,
      paymentId,
    });
  }

  const claimedAttempt = await claimCheckoutPaymentAttempt(attempt.id, {
    paymentId,
    rawPayload,
  });

  if (!claimedAttempt) {
    return NextResponse.json({
      ok: true,
      alreadyClaimed: true,
      paymentId,
    });
  }

  try {
    if (!cartId) {
      await updateCheckoutPaymentAttempt(claimedAttempt.id, {
        paymentId,
        preferenceId: preferenceId || claimedAttempt.preferenceId,
        status: "failed",
        processedAt: null,
        rawPayload,
      });

      return NextResponse.json({
        ok: false,
        acknowledged: true,
        error: "Approved payment is missing external_reference/cartId.",
        paymentId,
      });
    }

    const officialCart = await getOfficialCartById(cartId);

    if (!officialCart) {
      await updateCheckoutPaymentAttempt(claimedAttempt.id, {
        paymentId,
        preferenceId: preferenceId || claimedAttempt.preferenceId,
        status: "failed",
        processedAt: null,
        rawPayload,
      });

      return NextResponse.json({
        ok: false,
        acknowledged: true,
        error: `Cart "${cartId}" was not found or has expired.`,
        paymentId,
      });
    }

    const resolvedPreferenceId = preferenceId || claimedAttempt.preferenceId;
    const approvedAt = new Date();
    const orderRequestIdempotencyKey =
      claimedAttempt.orderRequestIdempotencyKey ||
      buildOrderRequestIdempotencyKey(claimedAttempt.id);

    const order = await createOrder({
      cartId: officialCart.id,
      customer: claimedAttempt.customer,
      notes: claimedAttempt.notes ?? undefined,
      metadata: {
        checkoutPaymentId: claimedAttempt.id,
        paymentId,
        preferenceId: resolvedPreferenceId,
        orderRequestIdempotencyKey,
        approvedAt: approvedAt.toISOString(),
        source: "mercadopago-webhook",
      },
    });

    await updateCheckoutPaymentAttempt(claimedAttempt.id, {
      paymentId,
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
        paymentId,
        idempotencyKey: buildPrintJobIdempotencyKey(order.id),
        payload: buildPrintJobPayload({
          orderId: order.id,
          purchaseNumber: order.purchaseNumber,
          checkoutPaymentId: claimedAttempt.id,
          paymentId,
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

      console.error("[mercadopago:webhook] Failed to enqueue print job.", {
        checkoutPaymentId: claimedAttempt.id,
        orderId: order.id,
        paymentId,
        error: printError,
      });
    }

    return NextResponse.json({
      ok: true,
      orderId: order.id,
      paymentId,
      cartId: officialCart.id,
      printJobId,
      printStatus,
    });
  } catch (error) {
    await updateCheckoutPaymentAttempt(claimedAttempt.id, {
      paymentId,
      preferenceId: preferenceId || claimedAttempt.preferenceId,
      status: "failed",
      processedAt: null,
      rawPayload,
    });

    throw error;
  }
}

export async function POST(request: Request) {
  const rawText = await request.text();
  const payload = parsePayload(rawText);
  const topic = normalizeTopic(payload, request);
  const resourceId = normalizeNotificationResourceId(payload, request);
  const signatureVerification = verifyWebhookSignature(request);

  console.info("[mercadopago:webhook] Notification received.", {
    topic,
    resourceId,
    hasBody: Boolean(rawText),
    signatureVerified: signatureVerification.enabled ? signatureVerification.valid : "skipped",
  });

  if (!signatureVerification.valid) {
    console.warn("[mercadopago:webhook] Notification rejected.", {
      topic,
      resourceId,
      reason: signatureVerification.reason,
    });

    return NextResponse.json(
      {
        ok: false,
        error: signatureVerification.reason ?? "Invalid Mercado Pago webhook signature.",
      },
      { status: 401 },
    );
  }

  if (!isPaymentTopic(topic) && !isMerchantOrderTopic(topic)) {
    return NextResponse.json({
      ok: true,
      ignored: true,
      topic,
    });
  }

  try {
    const { payment, merchantOrder } = await resolvePaymentFromNotification(topic, resourceId);

    if (!payment) {
      return NextResponse.json({
        ok: true,
        ignored: true,
        topic,
        resourceId,
        reason: "Notification does not reference a payment yet.",
      });
    }

    return await syncPaymentAttemptFromMercadoPago({
      notification: payload,
      payment,
      merchantOrder,
      topic,
      resourceId,
      signatureVerified: signatureVerification.valid,
    });
  } catch (error) {
    console.error("[mercadopago:webhook] Failed to process notification.", error);

    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while processing Mercado Pago webhook.",
        payload: rawText ? toRawPayload(payload) : undefined,
      },
      { status: 500 },
    );
  }
}
