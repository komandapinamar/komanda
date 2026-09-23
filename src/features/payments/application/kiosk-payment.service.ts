import { withTenantTransaction } from "@/db/tenant-transaction";
import { tenants, tenantLocations, paymentAttempts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { TenantContext } from "@/lib/tenant-context/types";
import { CartRepository } from "@/features/cart/infrastructure/cart.repository";
import { centsToMoney, revalidateCartSelection } from "@/features/cart/domain/cart.rules";
import { IntegrationRepository } from "@/features/payments/infrastructure/integration.repository";
import { MercadoPagoCheckoutClient } from "@/features/payments/application/payment-session.service";
import { IdempotencyService } from "@/lib/idempotency/idempotency.service";
import {
  createKioskPaymentSessionSchema,
  type KioskPaymentSessionResponse,
} from "@/features/payments/domain/kiosk-payment.schemas";
import {
  PaymentGatewayNotConfiguredError,
  KioskPaymentCartUnavailableError,
  KioskPaymentItemUnavailableError,
} from "@/features/payments/web/kiosk-payment-http";

export class KioskPaymentService {
  constructor(
    private readonly mercadoPagoClient: MercadoPagoCheckoutClient = new MercadoPagoCheckoutClient(),
  ) {}

  async createSession(input: {
    context: TenantContext;
    body: unknown;
    idempotencyKey: string;
    baseUrl: string;
  }): Promise<KioskPaymentSessionResponse> {
    const request = createKioskPaymentSessionSchema.parse(input.body);
    const { context, idempotencyKey } = input;

    return withTenantTransaction(context, async (transaction) => {
      const integrations = new IntegrationRepository(
        transaction,
        context.tenantId,
      );

      const account = await integrations.currentMercadoPago();
      if (!account || account.status !== "active") {
        throw new PaymentGatewayNotConfiguredError(
          "El local no tiene una cuenta de Mercado Pago activa para recibir cobros.",
        );
      }

      const idempotency = new IdempotencyService(transaction);
      const claim = await idempotency.claim({
        tenantId: context.tenantId,
        scope: "kiosk-payment-session",
        key: idempotencyKey,
        request,
        retentionSeconds: 120,
      });

      if (claim.replayed) {
        return claim.body as KioskPaymentSessionResponse;
      }

      const [tenantRow] = await transaction
        .select({ currency: tenants.defaultCurrency })
        .from(tenants)
        .where(eq(tenants.id, context.tenantId))
        .limit(1);

      if (!tenantRow) {
        throw new KioskPaymentCartUnavailableError("Tenant not found.");
      }

      const [location] = await transaction
        .select({ id: tenantLocations.id })
        .from(tenantLocations)
        .where(
          and(
            eq(tenantLocations.tenantId, context.tenantId),
            eq(tenantLocations.isPrimary, true),
            eq(tenantLocations.status, "active"),
          ),
        )
        .limit(1);

      if (!location) {
        throw new KioskPaymentCartUnavailableError(
          "Primary location not found.",
        );
      }

      const cartRepo = new CartRepository(transaction, context.tenantId);
      let subtotalCents = 0;
      const lines: Array<{
        kind: "item" | "combo";
        resourceId: string;
        quantity: number;
        name: string;
        unitPrice: string;
        lineTotal: string;
        imageUrl: string | null;
        options: Array<{
          groupId: string;
          optionId: string;
          name: string;
          priceDelta: string;
        }>;
      }> = [];

      for (const itemReq of request.items) {
        const catalog = await cartRepo.loadSelection(
          "item",
          itemReq.catalogItemId,
        );
        if (!catalog || catalog.currency !== tenantRow.currency) {
          throw new KioskPaymentItemUnavailableError(
            `Product ${itemReq.catalogItemId} is unavailable.`,
          );
        }

        const validated = revalidateCartSelection(
          {
            kind: "item",
            resourceId: itemReq.catalogItemId,
            quantity: itemReq.quantity,
            options: [],
          },
          catalog,
        );

        const lineTotalCents = validated.unitPriceCents * itemReq.quantity;
        subtotalCents += lineTotalCents;

        lines.push({
          kind: "item",
          resourceId: itemReq.catalogItemId,
          quantity: itemReq.quantity,
          name: catalog.name,
          unitPrice: centsToMoney(validated.unitPriceCents),
          lineTotal: centsToMoney(lineTotalCents),
          imageUrl: catalog.imageUrl,
          options: validated.options,
        });
      }

      const expiresAt = new Date(Date.now() + 120 * 1000);
      const cart = await cartRepo.create({
        locationId: location.id,
        currency: tenantRow.currency,
        subtotal: centsToMoney(subtotalCents),
        total: centsToMoney(subtotalCents),
        expiresAt,
        lines,
      });

      if (!cart) {
        throw new KioskPaymentCartUnavailableError("Failed to create cart.");
      }

      const attempt = await integrations.createPaymentAttempt({
        cartId: cart.id,
        integrationAccountId: account.id,
        amount: cart.total,
        currency: cart.currency,
        customer: request.customer as Record<string, unknown>,
        notes: request.notes ?? "Cobro Kiosk QR Mercado Pago",
        idempotencyKey,
      });

      try {
        const tokens = integrations.decryptTokens(account);
        const preference = await this.mercadoPagoClient.createPreference({
          accessToken: tokens.accessToken,
          paymentAttemptId: attempt.id,
          routingKey: account.webhookRoutingKey,
          cart,
          customer: request.customer,
          notes: request.notes,
          baseUrl: input.baseUrl,
        });

        await integrations.attachPreference({
          attemptId: attempt.id,
          integrationAccountId: account.id,
          preferenceId: preference.preferenceId,
        });

        const body: KioskPaymentSessionResponse = {
          paymentAttemptId: attempt.id,
          cartId: cart.id,
          total: cart.total,
          currency: cart.currency,
          qrData: preference.redirectUrl,
          expiresAt: expiresAt.toISOString(),
          timeoutSeconds: 120,
        };

        await idempotency.complete(claim.recordId, 201, body);
        return body;
      } catch (error) {
        await idempotency.fail(claim.recordId);
        throw error;
      }
    });
  }

  async cancelAttempt(input: {
    context: TenantContext;
    attemptId: string;
    idempotencyKey: string;
  }): Promise<{ status: "cancelled"; cancelledAt: string }> {
    const { context, attemptId, idempotencyKey } = input;
    return withTenantTransaction(context, async (transaction) => {
      const idempotency = new IdempotencyService(transaction);
      const claim = await idempotency.claim({
        tenantId: context.tenantId,
        scope: `kiosk-cancel-attempt:${attemptId}`,
        key: idempotencyKey,
        request: { attemptId },
        retentionSeconds: 120,
      });

      if (claim.replayed) {
        return claim.body as { status: "cancelled"; cancelledAt: string };
      }

      const [attempt] = await transaction
        .select()
        .from(paymentAttempts)
        .where(
          and(
            eq(paymentAttempts.tenantId, context.tenantId),
            eq(paymentAttempts.id, attemptId),
          ),
        )
        .limit(1);

      if (!attempt) {
        throw new KioskPaymentCartUnavailableError("Payment attempt not found.");
      }

      const cancelledAt = new Date().toISOString();

      if (
        attempt.status === "initiated" ||
        attempt.status === "processing" ||
        attempt.status === "pending"
      ) {
        await transaction
          .update(paymentAttempts)
          .set({
            status: "failed",
            failureCode: "cancelled_by_kiosk_timeout_or_user",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(paymentAttempts.tenantId, context.tenantId),
              eq(paymentAttempts.id, attemptId),
            ),
          );
      }

      const body = { status: "cancelled" as const, cancelledAt };
      await idempotency.complete(claim.recordId, 200, body);
      return body;
    });
  }
}
