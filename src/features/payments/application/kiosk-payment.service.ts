import { withTenantTransaction } from "@/db/tenant-transaction";
import { tenants, tenantLocations, paymentAttempts, tenantOrders, carts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { TenantContext } from "@/lib/tenant-context/types";
import { CartRepository } from "@/features/cart/infrastructure/cart.repository";
import { centsToMoney, moneyToCents, revalidateCartSelection } from "@/features/cart/domain/cart.rules";
import { IntegrationRepository } from "@/features/payments/infrastructure/integration.repository";
import { DiscountRepository } from "@/features/discounts/infrastructure/discount.repository";
import { calculateDiscountAmounts } from "@/features/discounts/domain/discount.rules";
import { MercadoPagoCheckoutClient } from "@/features/payments/application/payment-session.service";
import { IdempotencyService } from "@/lib/idempotency/idempotency.service";
import {
  createKioskPaymentSessionSchema,
  kioskDiscountPreviewSchema,
  type KioskDiscountPreviewResponse,
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
      const categoryMap = new Map<string, string | null>();
      const lines: Array<{
        kind: "item" | "combo";
        resourceId: string;
        itemType?: "unit" | "weighted";
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

        categoryMap.set(
          itemReq.catalogItemId,
          (catalog as { categoryId?: string | null }).categoryId ?? null,
        );

        const validated = revalidateCartSelection(
          {
            kind: "item",
            resourceId: itemReq.catalogItemId,
            quantity: itemReq.quantity,
            optionIds: [],
            calculatedSubtotal: itemReq.calculatedSubtotal,
          },
          catalog,
        );

        const effectiveQuantity =
          validated.itemType === "weighted" ? 1 : itemReq.quantity;
        const lineTotalCents = validated.unitPriceCents * effectiveQuantity;
        subtotalCents += lineTotalCents;

        lines.push({
          kind: "item",
          resourceId: itemReq.catalogItemId,
          itemType: validated.itemType,
          quantity: effectiveQuantity,
          name: catalog.name,
          unitPrice: centsToMoney(validated.unitPriceCents),
          lineTotal: centsToMoney(lineTotalCents),
          imageUrl: catalog.imageUrl,
          options: validated.options,
        });
      }

      let discountTotal = "0.00";
      let totalCents = subtotalCents;
      let appliedDiscountCodeId: string | null = null;
      let discountMetadata: {
        code: string;
        name: string;
        discountType: string;
        discountValue: string;
        savingsAmount: string;
        tenderRestriction?: string;
      } | null = null;

      if (request.discountCode) {
        const discountRepo = new DiscountRepository(
          transaction,
          context.tenantId,
        );
        const discount = await discountRepo.findByCode(request.discountCode);
        if (!discount) {
          throw new KioskPaymentCartUnavailableError(
            "Código de descuento inválido o no encontrado.",
          );
        }

        const linesForDiscount = lines.map((line, index) => ({
          id: `line-${index}`,
          resourceId: line.resourceId,
          categoryId: categoryMap.get(line.resourceId) ?? undefined,
          quantity: line.quantity,
          unitPriceCents: moneyToCents(line.unitPrice),
          lineTotalCents: moneyToCents(line.lineTotal),
        }));

        const calcResult = calculateDiscountAmounts({
          lines: linesForDiscount,
          coupon: discount,
          now: new Date(),
          tender: "mercadopago",
        });

        if (!calcResult.isEligible) {
          throw new KioskPaymentCartUnavailableError(
            calcResult.ineligibilityReason === "COUPON_TENDER_MISMATCH"
              ? "Este cupón es exclusivo para pagos en efectivo."
              : "El código de descuento no es aplicable a este pedido.",
          );
        }

        discountTotal = calcResult.discountTotal;
        totalCents = calcResult.totalCents;
        appliedDiscountCodeId = discount.id;
        discountMetadata = {
          code: discount.code,
          name: discount.name,
          discountType: discount.discountType,
          discountValue: discount.discountValue,
          savingsAmount: calcResult.discountTotal,
        };
      }

      const expiresAt = new Date(Date.now() + 120 * 1000);
      const cart = await cartRepo.create({
        locationId: location.id,
        currency: tenantRow.currency,
        subtotal: centsToMoney(subtotalCents),
        discountTotal,
        total: centsToMoney(totalCents),
        appliedDiscountCodeId,
        discountMetadata,
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

  async previewDiscount(input: {
    context: TenantContext;
    body: unknown;
  }): Promise<KioskDiscountPreviewResponse> {
    const request = kioskDiscountPreviewSchema.parse(input.body);

    return withTenantTransaction(input.context, async (transaction) => {
      const [tenantRow] = await transaction
        .select({ currency: tenants.defaultCurrency })
        .from(tenants)
        .where(eq(tenants.id, input.context.tenantId))
        .limit(1);

      if (!tenantRow) {
        throw new KioskPaymentCartUnavailableError("Tenant not found.");
      }

      const cartRepo = new CartRepository(transaction, input.context.tenantId);
      let subtotalCents = 0;
      const linesForDiscount: Array<{
        id: string;
        resourceId: string;
        categoryId: string | null;
        quantity: number;
        unitPriceCents: number;
        lineTotalCents: number;
      }> = [];

      for (const [index, itemReq] of request.items.entries()) {
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
            optionIds: [],
            calculatedSubtotal: itemReq.calculatedSubtotal,
          },
          catalog,
        );

        const effectiveQuantity =
          validated.itemType === "weighted" ? 1 : itemReq.quantity;
        const lineTotalCents = validated.unitPriceCents * effectiveQuantity;
        subtotalCents += lineTotalCents;
        linesForDiscount.push({
          id: `line-${index}`,
          resourceId: itemReq.catalogItemId,
          categoryId:
            (catalog as { categoryId?: string | null }).categoryId ?? null,
          quantity: effectiveQuantity,
          unitPriceCents: validated.unitPriceCents,
          lineTotalCents,
        });
      }

      const subtotal = centsToMoney(subtotalCents);
      const discountRepo = new DiscountRepository(
        transaction,
        input.context.tenantId,
      );
      const discount = await discountRepo.findByCode(request.discountCode);

      if (!discount) {
        return {
          eligible: false,
          reason: "DISCOUNT_NOT_FOUND",
          code: request.discountCode,
          name: null,
          subtotal,
          discountTotal: "0.00",
          total: subtotal,
          applicableTender: null,
        };
      }

      const calcResult = calculateDiscountAmounts({
        lines: linesForDiscount,
        coupon: discount,
        now: new Date(),
        tender: request.tender,
      });

      if (!calcResult.isEligible) {
        return {
          eligible: false,
          reason: calcResult.ineligibilityReason ?? "DISCOUNT_NOT_APPLICABLE",
          code: discount.code,
          name: discount.name,
          subtotal,
          discountTotal: "0.00",
          total: subtotal,
          applicableTender: discount.applicableTender,
        };
      }

      return {
        eligible: true,
        reason: null,
        code: discount.code,
        name: discount.name,
        subtotal,
        discountTotal: calcResult.discountTotal,
        total: calcResult.total,
        applicableTender: discount.applicableTender,
      };
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

  async getAttemptStatus(input: {
    context: TenantContext;
    attemptId: string;
  }): Promise<{
    status: string;
    secondsRemaining?: number;
    orderId?: string;
    purchaseNumber?: string;
    total?: string;
    paymentId?: string;
    reason?: string;
  }> {
    const { context, attemptId } = input;
    return withTenantTransaction(context, async (transaction) => {
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

      if (attempt.status === "approved") {
        const [order] = await transaction
          .select({
            id: tenantOrders.id,
            purchaseNumber: tenantOrders.purchaseNumber,
          })
          .from(tenantOrders)
          .where(
            and(
              eq(tenantOrders.tenantId, context.tenantId),
              eq(tenantOrders.paymentAttemptId, attemptId),
            ),
          )
          .limit(1);

        return {
          status: "approved",
          orderId: order?.id ?? attempt.id,
          purchaseNumber: order ? String(order.purchaseNumber) : undefined,
          total: attempt.amount,
          paymentId: attempt.providerPaymentId ?? undefined,
        };
      }

      if (attempt.status === "failed" || attempt.status === "rejected") {
        return {
          status: "failed",
          reason: attempt.failureCode ?? "payment_failed",
        };
      }

      const [cart] = await transaction
        .select({ expiresAt: carts.expiresAt })
        .from(carts)
        .where(
          and(
            eq(carts.tenantId, context.tenantId),
            eq(carts.id, attempt.cartId),
          ),
        )
        .limit(1);

      const expiresAtMs = cart?.expiresAt
        ? cart.expiresAt.getTime()
        : attempt.createdAt.getTime() + 120_000;
      const secondsRemaining = Math.max(
        0,
        Math.round((expiresAtMs - Date.now()) / 1000),
      );

      if (secondsRemaining === 0) {
        return {
          status: "expired",
          reason: "timeout_reached",
        };
      }

      return {
        status: "pending",
        secondsRemaining,
      };
    });
  }
}
