import "server-only";

import {
  MercadoPagoConfig,
  Payment,
  Preference,
} from "mercadopago";
import type { PaymentResponse } from "mercadopago/dist/clients/payment/commonTypes";
import type { PreferenceRequest } from "mercadopago/dist/clients/preference/commonTypes";
import type { CustomerInfo, OfficialCart } from "@/types/types";

const accessToken = process.env.MP_ACCESS_TOKEN;

if (!accessToken) {
  throw new Error("Missing MP_ACCESS_TOKEN environment variable.");
}

const mercadopago = new MercadoPagoConfig({
  accessToken,
  options: {
    timeout: 5000,
  },
});

type CreatePreferenceInput = {
  paymentId: string;
  cart: OfficialCart;
  customer: CustomerInfo;
  notes?: string;
  baseUrl: string;
};

type MercadoPagoPreferenceSession = {
  paymentId: string;
  preferenceId: string;
  initPoint: string;
  sandboxInitPoint?: string;
};

type MercadoPagoMerchantOrderPayment = {
  id?: string | number;
  status?: string;
  date_approved?: string;
  last_modified?: string;
  date_created?: string;
};

export type MercadoPagoMerchantOrder = {
  id: string | number;
  status?: string;
  order_status?: string;
  external_reference?: string | null;
  preference_id?: string | null;
  payments?: MercadoPagoMerchantOrderPayment[];
};

function toTrailingSlashlessUrl(value: string) {
  return value.replace(/\/$/, "");
}

function buildWebhookOnlyNotificationUrl(value: string) {
  const url = new URL(value);
  url.searchParams.set("source_news", "webhooks");
  return url.toString();
}

function splitCustomerName(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  const [firstName, ...rest] = normalized.split(" ");

  return {
    firstName: firstName ?? normalized,
    lastName: rest.join(" "),
  };
}

function toMercadoPagoPhone(phone: string) {
  const digitsOnly = phone.replace(/\D/g, "");

  return digitsOnly.length > 0
    ? {
        number: digitsOnly,
      }
    : undefined;
}

function buildFallbackPayerEmail(paymentId: string) {
  return `checkout+${paymentId}@example.com`;
}

function buildPreferenceRequest(input: CreatePreferenceInput): PreferenceRequest {
  const baseUrl = toTrailingSlashlessUrl(input.baseUrl);
  const webhookUrl =
    process.env.MP_WEBHOOK_URL?.replace(/\/$/, "") ??
    `${baseUrl}/api/payments/webhook`;
  const webhookOnlyUrl = buildWebhookOnlyNotificationUrl(webhookUrl);
  const { firstName, lastName } = splitCustomerName(input.customer.name);

  return {
    external_reference: input.cart.id,
    auto_return: "approved",
    notification_url: webhookOnlyUrl,
    back_urls: {
      success: `${baseUrl}/checkout/pay/success`,
      pending: `${baseUrl}/checkout/pay/pending`,
      failure: `${baseUrl}/checkout/pay/failure`,
    },
    expires: Boolean(input.cart.expiresAt),
    expiration_date_to: input.cart.expiresAt,
    payer: {
      name: firstName,
      surname: lastName || undefined,
      email: input.customer.email?.trim() || buildFallbackPayerEmail(input.paymentId),
      phone: input.customer.phone ? toMercadoPagoPhone(input.customer.phone) : undefined,
    },
    metadata: {
      checkoutPaymentId: input.paymentId,
      cartId: input.cart.id,
      notes: input.notes ?? null,
      customerName: input.customer.name,
    },
    items: input.cart.items.map((item) => ({
      id: item.documentId,
      title: item.name,
      description: item.note,
      picture_url: item.image,
      quantity: item.quantity,
      currency_id: input.cart.currency,
      unit_price: Number(item.unitPrice.toFixed(2)),
    })),
  };
}

export async function createMercadoPagoPreference(
  input: CreatePreferenceInput,
): Promise<MercadoPagoPreferenceSession> {
  const preference = new Preference(mercadopago);
  const response = await preference.create({
    body: buildPreferenceRequest(input),
  });

  if (!response.id || !response.init_point) {
    throw new Error("Mercado Pago preference response is missing required fields.");
  }

  return {
    paymentId: input.paymentId,
    preferenceId: response.id,
    initPoint: response.init_point,
    sandboxInitPoint: response.sandbox_init_point,
  };
}

export async function getMercadoPagoPayment(paymentId: string | number) {
  const payment = new Payment(mercadopago);
  const response = (await payment.get({
    id: paymentId,
  })) as PaymentResponse;

  if (!response.id) {
    throw new Error("Mercado Pago payment response is missing a valid id.");
  }

  return response;
}

export async function getMercadoPagoMerchantOrder(orderId: string | number) {
  const response = await fetch(`https://api.mercadopago.com/merchant_orders/${orderId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Mercado Pago merchant order request failed with status ${response.status}.`);
  }

  const merchantOrder = (await response.json()) as MercadoPagoMerchantOrder;

  if (!merchantOrder.id) {
    throw new Error("Mercado Pago merchant order response is missing a valid id.");
  }

  return merchantOrder;
}
