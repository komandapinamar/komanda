import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type {
  CreatePaymentSessionPayload,
  OfficialCart,
} from "@/types/types";
import {
  ADMIN_BYPASS_HEADER_NAME,
  ADMIN_SESSION_COOKIE_NAME,
  verifyAdminSessionToken,
} from "@/features/admin-panel/lib/admin-session";
import { getOfficialCartById } from "@/features/shop/cart/server/cart.store";
import { createAdminDirectOrder } from "@/features/shop/payments/server/admin-direct-order.service";
import { createCheckoutPaymentAttempt } from "@/features/shop/payments/server/payment.store";
import { createMercadoPagoPreference } from "@/features/shop/payments/server/mercadopago.service";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function getBaseUrl(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

async function getOfficialCart(cartId: string): Promise<OfficialCart> {
  const cart = await getOfficialCartById(cartId);

  if (!cart) {
    throw new Error(`Cart "${cartId}" was not found or has expired.`);
  }

  return cart;
}

async function getAdminSessionFromRequest(request: Request) {
  if (request.headers.get(ADMIN_BYPASS_HEADER_NAME) !== "1") {
    return null;
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifyAdminSessionToken(token);
}

function validatePayload(payload: CreatePaymentSessionPayload) {
  if (!isNonEmptyString(payload.cartId)) {
    return "cartId is required.";
  }

  if (!isNonEmptyString(payload.customer?.name)) {
    return "customer.name is required.";
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as CreatePaymentSessionPayload;
    const validationError = validatePayload(payload);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const cart = await getOfficialCart(payload.cartId!.trim());
    const customer = {
      name: payload.customer!.name.trim(),
    };
    const notes = payload.notes?.trim() || undefined;

    if (cart.items.length === 0) {
      return NextResponse.json(
        { error: "The official cart is empty. Cannot create a payment session." },
        { status: 409 },
      );
    }

    const unavailableItems = cart.items.filter((item) => !item.available);

    if (unavailableItems.length > 0) {
      return NextResponse.json(
        {
          error: "The official cart contains unavailable items.",
          unavailableItems: unavailableItems.map((item) => ({
            documentId: item.documentId,
            name: item.name,
          })),
        },
        { status: 409 },
      );
    }

    if (cart.total <= 0) {
      return NextResponse.json(
        { error: "The official cart total must be greater than zero." },
        { status: 409 },
      );
    }

    const adminSession = await getAdminSessionFromRequest(request);

    if (adminSession) {
      const directOrder = await createAdminDirectOrder({
        adminUsername: adminSession.username,
        cart,
        customer,
        notes,
      });
      const successUrl = new URL("/checkout/pay/success", getBaseUrl(request));

      successUrl.searchParams.set("source", "admin-direct");
      successUrl.searchParams.set("order_id", directOrder.orderId);
      successUrl.searchParams.set("purchase_number", directOrder.purchaseNumber);
      successUrl.searchParams.set("customer_name", directOrder.customerName);
      successUrl.searchParams.set("payment_id", directOrder.paymentId);
      successUrl.searchParams.set("print_status", directOrder.printStatus);

      return NextResponse.json({
        paymentId: directOrder.paymentId,
        preferenceId: directOrder.preferenceId,
        initPoint: successUrl.toString(),
        cartId: cart.id,
        amount: cart.total,
        currency: cart.currency,
        items: cart.items,
        summary: {
          subtotal: cart.subtotal,
          discountTotal: cart.discountTotal,
          total: cart.total,
        },
      });
    }

    const paymentId = crypto.randomUUID();
    const session = await createMercadoPagoPreference({
      paymentId,
      cart,
      customer,
      notes,
      baseUrl: getBaseUrl(request),
    });

    await createCheckoutPaymentAttempt({
      id: paymentId,
      cartId: cart.id,
      preferenceId: session.preferenceId,
      customer,
      notes,
      amount: cart.total,
      currency: cart.currency,
    });

    return NextResponse.json({
      paymentId: session.paymentId,
      preferenceId: session.preferenceId,
      initPoint: session.initPoint,
      sandboxInitPoint: session.sandboxInitPoint,
      cartId: cart.id,
      amount: cart.total,
      currency: cart.currency,
      items: cart.items,
      summary: {
        subtotal: cart.subtotal,
        discountTotal: cart.discountTotal,
        total: cart.total,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while creating the payment session.",
      },
      { status: 500 },
    );
  }
}
