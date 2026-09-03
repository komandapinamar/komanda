import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { CartRepository } from "@/features/cart/infrastructure/cart.repository";
import {
  CartRevalidationError,
  centsToMoney,
  revalidateCartSelection,
} from "@/features/cart/domain/cart.rules";
import {
  IntegrationRepository,
  PaymentAttemptIdempotencyConflictError,
} from "@/features/payments/infrastructure/integration.repository";
import {
  PublicTenantService,
  type PublicTenant,
} from "@/features/tenancy/application/public-tenant.service";
import { IdempotencyService } from "@/lib/idempotency/idempotency.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";
import type { MercadoPagoTokens } from "@/features/payments/infrastructure/mercadopago-oauth.client";

export class PaymentSessionCartUnavailableError extends Error {}
export class PaymentSessionConflictError extends Error {}
export class PaymentSessionProviderUnavailableError extends Error {}

const optionalTrimmedString = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim().length === 0
      ? undefined
      : value,
  z.string().trim().optional(),
);

const createPaymentSessionSchema = z
  .object({
    customer: z
      .object({
        name: z.string().trim().min(1),
        email: z.preprocess(
          (value) =>
            typeof value === "string" && value.trim().length === 0
              ? undefined
              : value,
          z.string().trim().email().optional(),
        ),
        phone: optionalTrimmedString,
      })
      .strict(),
    notes: optionalTrimmedString,
    cartVersion: z.number().int().positive().optional(),
  })
  .strict();

type CreatePaymentSessionRequest = z.infer<typeof createPaymentSessionSchema>;
type StoredCart = NonNullable<Awaited<ReturnType<CartRepository["find"]>>>;

type PreparedPaymentSession =
  | { replayed: true; status: number; body: PaymentSessionResponse }
  | {
      replayed: false;
      tenant: PublicTenant;
      cart: StoredCart;
      request: CreatePaymentSessionRequest;
      attemptId: string;
      integrationAccountId: string;
      webhookRoutingKey: string;
      tokens: MercadoPagoTokens;
      idempotencyRecordId: string;
    };

export type PaymentSessionResponse = {
  paymentAttemptId: string;
  preferenceId: string;
  redirectUrl: string;
  sandboxRedirectUrl?: string;
  cartId: string;
  amount: string;
  currency: string;
};

type MercadoPagoPreferenceInput = {
  accessToken: string;
  paymentAttemptId: string;
  routingKey: string;
  cart: StoredCart;
  customer: CreatePaymentSessionRequest["customer"];
  notes?: string;
  baseUrl: string;
};

type MercadoPagoPreferenceResponse = {
  preferenceId: string;
  redirectUrl: string;
  sandboxRedirectUrl?: string;
};

function trailingSlashless(value: string) {
  return value.replace(/\/$/, "");
}

function mercadoPagoApiBaseUrl() {
  const configured = process.env.MERCADOPAGO_API_BASE_URL?.trim();
  if (!configured) return "https://api.mercadopago.com";
  if (
    process.env.KOMANDA_TEST_MODE !== "1" ||
    process.env.NODE_ENV === "production"
  ) {
    throw new Error(
      "MERCADOPAGO_API_BASE_URL can only override Mercado Pago in test mode.",
    );
  }
  return trailingSlashless(configured);
}

function splitCustomerName(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ");
  const [firstName, ...rest] = normalized.split(" ");
  return {
    firstName: firstName ?? normalized,
    lastName: rest.join(" "),
  };
}

function fallbackPayerEmail(paymentAttemptId: string) {
  return `checkout+${paymentAttemptId}@example.com`;
}

function paymentNotificationUrl(baseUrl: string, routingKey: string) {
  const url = new URL(
    `/api/v1/integrations/mercadopago/webhooks/${routingKey}`,
    trailingSlashless(baseUrl),
  );
  url.searchParams.set("source_news", "webhooks");
  return url.toString();
}

function checkoutBackUrl(baseUrl: string, status: "success" | "pending" | "failure") {
  return new URL(`/checkout/pay/${status}`, trailingSlashless(baseUrl)).toString();
}

function positiveMoney(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function lineResourceId(line: StoredCart["lines"][number]) {
  return line.itemId ?? line.comboId ?? line.id;
}

export class MercadoPagoCheckoutClient {
  constructor(private readonly timeoutMs = 5_000) {}

  async createPreference(
    input: MercadoPagoPreferenceInput,
  ): Promise<MercadoPagoPreferenceResponse> {
    const { firstName, lastName } = splitCustomerName(input.customer.name);
    const response = await fetch(`${mercadoPagoApiBaseUrl()}/checkout/preferences`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_reference: input.cart.id,
        auto_return: "approved",
        notification_url: paymentNotificationUrl(input.baseUrl, input.routingKey),
        back_urls: {
          success: checkoutBackUrl(input.baseUrl, "success"),
          pending: checkoutBackUrl(input.baseUrl, "pending"),
          failure: checkoutBackUrl(input.baseUrl, "failure"),
        },
        expires: Boolean(input.cart.expiresAt),
        expiration_date_to: input.cart.expiresAt?.toISOString(),
        payer: {
          name: firstName,
          surname: lastName || undefined,
          email:
            input.customer.email ??
            fallbackPayerEmail(input.paymentAttemptId),
          phone: input.customer.phone
            ? { number: input.customer.phone.replace(/\D/g, "") }
            : undefined,
        },
        metadata: {
          paymentAttemptId: input.paymentAttemptId,
          cartId: input.cart.id,
          notes: input.notes ?? null,
          customerName: input.customer.name,
        },
        items: input.cart.lines.map((line) => ({
          id: lineResourceId(line),
          title: line.nameSnapshot,
          description: line.note ?? undefined,
          picture_url: line.imageUrlSnapshot ?? undefined,
          quantity: line.quantity,
          currency_id: input.cart.currency,
          unit_price: Number(Number(line.unitPriceSnapshot).toFixed(2)),
        })),
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new PaymentSessionProviderUnavailableError(
        "Mercado Pago preference creation failed.",
      );
    }

    const body = (await response.json()) as {
      id?: string;
      init_point?: string;
      sandbox_init_point?: string;
    };

    if (!body.id || !body.init_point) {
      throw new PaymentSessionProviderUnavailableError(
        "Mercado Pago preference response is incomplete.",
      );
    }

    return {
      preferenceId: body.id,
      redirectUrl: body.init_point,
      sandboxRedirectUrl: body.sandbox_init_point,
    };
  }
}

function publicContext(tenant: PublicTenant, correlationId: string) {
  return createVerifiedTenantContext({
    tenantId: tenant.id,
    locationId: tenant.locationId,
    correlationId,
    source: "public",
    actor: { kind: "anonymous", tenantSlug: tenant.slug },
  });
}

export class PaymentSessionService {
  constructor(
    private readonly tenants = new PublicTenantService(),
    private readonly mercadoPago = new MercadoPagoCheckoutClient(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: {
    tenantSlug: string;
    cartId: string;
    idempotencyKey: string;
    body: unknown;
    baseUrl: string;
    correlationId?: string;
  }): Promise<PaymentSessionResponse> {
    const request = createPaymentSessionSchema.parse(input.body);
    const tenant = await this.tenants.resolve(input.tenantSlug);
    const correlationId = input.correlationId ?? randomUUID();
    const prepared = await this.prepare({
      tenant,
      cartId: input.cartId,
      request,
      idempotencyKey: input.idempotencyKey,
      correlationId,
    });

    if (prepared.replayed) return prepared.body;

    try {
      const preference = await this.mercadoPago.createPreference({
        accessToken: prepared.tokens.accessToken,
        paymentAttemptId: prepared.attemptId,
        routingKey: prepared.webhookRoutingKey,
        cart: prepared.cart,
        customer: prepared.request.customer,
        notes: prepared.request.notes,
        baseUrl: input.baseUrl,
      });

      const body: PaymentSessionResponse = {
        paymentAttemptId: prepared.attemptId,
        preferenceId: preference.preferenceId,
        redirectUrl: preference.redirectUrl,
        sandboxRedirectUrl: preference.sandboxRedirectUrl,
        cartId: prepared.cart.id,
        amount: String(prepared.cart.total),
        currency: prepared.cart.currency,
      };

      await withTenantTransaction(
        publicContext(prepared.tenant, correlationId),
        async (transaction) => {
          const integrations = new IntegrationRepository(
            transaction,
            prepared.tenant.id,
          );
          await integrations.attachPreference(
            {
              attemptId: prepared.attemptId,
              integrationAccountId: prepared.integrationAccountId,
              preferenceId: preference.preferenceId,
            },
          );
          await new IdempotencyService(transaction).complete(
            prepared.idempotencyRecordId,
            201,
            body,
          );
        },
      );

      return body;
    } catch (error) {
      await withTenantTransaction(
        publicContext(prepared.tenant, correlationId),
        async (transaction) => {
          await new IdempotencyService(transaction).fail(
            prepared.idempotencyRecordId,
          );
        },
      ).catch(() => undefined);
      throw error;
    }
  }

  private async prepare(input: {
    tenant: PublicTenant;
    cartId: string;
    request: CreatePaymentSessionRequest;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<PreparedPaymentSession> {
    return withTenantTransaction(
      publicContext(input.tenant, input.correlationId),
      async (transaction) => {
        const idempotency = new IdempotencyService(transaction);
        const claim = await idempotency.claim({
          tenantId: input.tenant.id,
          scope: `payment-session:${input.cartId}`,
          key: input.idempotencyKey,
          request: input.request,
          retentionSeconds: 60 * 60,
        });
        if (claim.replayed) {
          return {
            replayed: true,
            status: claim.status,
            body: claim.body as PaymentSessionResponse,
          };
        }

        const cart = await new CartRepository(
          transaction,
          input.tenant.id,
        ).find(input.cartId);

        if (
          !cart ||
          cart.expiresAt <= this.now() ||
          cart.status === "expired" ||
          cart.status === "converted"
        ) {
          throw new PaymentSessionCartUnavailableError("Cart is unavailable.");
        }

        if (
          input.request.cartVersion !== undefined &&
          input.request.cartVersion !== cart.version
        ) {
          throw new PaymentSessionConflictError("Cart version is stale.");
        }

        if (cart.lines.length === 0 || !positiveMoney(cart.total)) {
          throw new PaymentSessionConflictError("Cart is not payable.");
        }

        for (const line of cart.lines) {
          const kind = line.itemId ? "item" : "combo";
          const resourceId = line.itemId ?? line.comboId;
          if (!resourceId) {
            throw new PaymentSessionConflictError(
              "Cart line has no catalog resource.",
            );
          }
          const catalog = await new CartRepository(
            transaction,
            input.tenant.id,
          ).loadSelection(kind, resourceId);
          if (!catalog || catalog.currency !== cart.currency) {
            throw new PaymentSessionConflictError(
              "Cart catalog resource is unavailable.",
            );
          }
          try {
            const current = revalidateCartSelection(
              {
                kind,
                resourceId,
                quantity: line.quantity,
                optionIds: line.options.flatMap((option) =>
                  option.addonOptionId ? [option.addonOptionId] : [],
                ),
              },
              catalog,
            );
            if (centsToMoney(current.unitPriceCents) !== line.unitPriceSnapshot) {
              throw new PaymentSessionConflictError("Cart price changed.");
            }
          } catch (error) {
            if (error instanceof CartRevalidationError) {
              throw new PaymentSessionConflictError(error.message);
            }
            throw error;
          }
        }

        const integrations = new IntegrationRepository(
          transaction,
          input.tenant.id,
        );

        if (!(await integrations.hasOnlinePaymentsEntitlement())) {
          throw new PaymentSessionConflictError(
            "Online payments are not enabled for this tenant.",
          );
        }

        const existingAttempt = await integrations.findActiveByCartId(cart.id);
        if (existingAttempt) {
          throw new PaymentSessionConflictError(
            "A payment session already exists for this cart.",
          );
        }

        const account = await integrations.currentMercadoPago();
        if (!account || account.status !== "active") {
          throw new PaymentSessionProviderUnavailableError(
            "Mercado Pago is not connected for this tenant.",
          );
        }

        let attempt;
        try {
          attempt = await integrations.createPaymentAttempt({
            cartId: cart.id,
            integrationAccountId: account.id,
            amount: String(cart.total),
            currency: cart.currency,
            customer: input.request.customer,
            notes: input.request.notes,
            idempotencyKey: input.idempotencyKey,
          });
        } catch (error) {
          if (error instanceof PaymentAttemptIdempotencyConflictError) {
            throw new PaymentSessionConflictError(error.message);
          }
          throw error;
        }

        return {
          replayed: false,
          tenant: input.tenant,
          cart,
          request: input.request,
          attemptId: attempt.id,
          integrationAccountId: account.id,
          webhookRoutingKey: account.webhookRoutingKey,
          tokens: integrations.decryptTokens(account),
          idempotencyRecordId: claim.recordId,
        };
      },
    );
  }
}
