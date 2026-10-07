import "server-only";

import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { tenantSettings } from "@/db/schema";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { CartRepository } from "@/features/cart/infrastructure/cart.repository";
import {
  BusinessClosedError,
  CashOrderCartUnavailableError,
  CartVersionMismatchError,
  OrderConflictError,
  OrderingNotSupportedError,
} from "@/features/orders/application/order-errors";
import {
  createCashOrderSchema,
  type CreateCashOrderRequest,
  type CreateCashOrderResponse,
} from "@/features/orders/domain/cash-order.schemas";
import { OrderRepository } from "@/features/orders/infrastructure/order.repository";
import {
  CouponTenderMismatchError,
  evaluateCouponEligibility,
} from "@/features/discounts/domain/discount.rules";
import { DiscountRepository } from "@/features/discounts/infrastructure/discount.repository";
import { moneyToCents } from "@/features/cart/domain/cart.rules";
import {
  PublicTenantService,
  type PublicTenant,
} from "@/features/tenancy/application/public-tenant.service";
import { IdempotencyService } from "@/lib/idempotency/idempotency.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export {
  BusinessClosedError,
  CashOrderCartUnavailableError,
  OrderConflictError,
  OrderingNotSupportedError,
};

function publicContext(tenant: PublicTenant, correlationId: string) {
  return createVerifiedTenantContext({
    tenantId: tenant.id,
    locationId: tenant.locationId,
    correlationId,
    source: "public",
    actor: { kind: "anonymous", tenantSlug: tenant.slug },
  });
}

export class CreateCashOrderService {
  constructor(
    private readonly tenants = new PublicTenantService(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: {
    tenantSlug: string;
    cartId: string;
    idempotencyKey: string;
    body: unknown;
    correlationId?: string;
  }): Promise<CreateCashOrderResponse> {
    const request = createCashOrderSchema.parse(input.body);
    const tenant = await this.tenants.resolve(input.tenantSlug);

    if (tenant.preset === "express_retail") {
      throw new OrderingNotSupportedError(
        "El comercio opera en modo autoservicio presencial. Los pedidos web no están habilitados.",
      );
    }

    const correlationId = input.correlationId ?? randomUUID();
    const context = publicContext(tenant, correlationId);

    return withTenantTransaction(context, async (transaction) => {
      const [settings] = await transaction
        .select({ salesEnabled: tenantSettings.salesEnabled })
        .from(tenantSettings)
        .where(eq(tenantSettings.tenantId, tenant.id))
        .limit(1);

      if (settings && settings.salesEnabled === false) {
        throw new BusinessClosedError(
          "El restaurante no se encuentra aceptando pedidos en este horario.",
        );
      }

      const idempotency = new IdempotencyService(transaction);
      const claim = await idempotency.claim({
        tenantId: tenant.id,
        scope: `cash-order:${input.cartId}`,
        key: input.idempotencyKey,
        request,
        retentionSeconds: 60 * 60,
      });

      if (claim.replayed) {
        const cached = claim.body as CreateCashOrderResponse;
        const remaining = Math.max(
          0,
          Math.floor(
            (new Date(cached.expiresAt).getTime() - this.now().getTime()) /
              1000,
          ),
        );
        return {
          ...cached,
          secondsRemaining: remaining,
        };
      }

      const cartRepo = new CartRepository(transaction, tenant.id);
      const cart = await cartRepo.find(input.cartId);

      if (!cart || cart.expiresAt <= this.now() || cart.status === "expired") {
        throw new CashOrderCartUnavailableError("Cart is unavailable or expired.");
      }

      if (cart.status === "converted") {
        throw new OrderConflictError("Cart is already converted to an order.");
      }

      if (
        request.cartVersion !== undefined &&
        request.cartVersion !== cart.version
      ) {
        throw new CartVersionMismatchError(
          "CART_VERSION_MISMATCH: Cart version is stale.",
        );
      }

      if (cart.lines.length === 0) {
        throw new OrderConflictError("Cart has no items.");
      }

      if (cart.appliedDiscountCodeId) {
        const discount = await new DiscountRepository(
          transaction,
          tenant.id,
        ).findById(cart.appliedDiscountCodeId);

        if (discount) {
          const applicableSubtotalCents = cart.lines.reduce(
            (sum, line) => sum + moneyToCents(line.lineTotal),
            0,
          );
          const eligibility = evaluateCouponEligibility(
            discount,
            applicableSubtotalCents,
            this.now(),
            "cash",
          );
          if (!eligibility.isEligible) {
            if (eligibility.ineligibilityReason === "COUPON_TENDER_MISMATCH") {
              throw new CouponTenderMismatchError();
            }
            throw new OrderConflictError(
              `El cupón aplicado ya no es válido (${eligibility.ineligibilityReason}). Quitá el cupón y reintentá.`,
            );
          }
        }
      }

      const now = this.now();
      const paymentExpiresAt = new Date(now.getTime() + 60 * 60 * 1000);
      const secondsRemaining = Math.max(
        0,
        Math.floor((paymentExpiresAt.getTime() - now.getTime()) / 1000),
      );
      const pickupPin = randomInt(1000, 10000).toString();

      const orderRepo = new OrderRepository(transaction, context);
      const { order } = await orderRepo.createFromCartSnapshot({
        cart,
        source: "storefront_cash",
        paymentStatus: "pending",
        tender: "cash",
        customer: {
          name: request.customer.name,
          phone: request.customer.phone ?? undefined,
        },
        notes: request.notes ?? undefined,
        idempotencyKey: input.idempotencyKey,
        pickupPin,
        paymentExpiresAt,
      });

      const response: CreateCashOrderResponse = {
        orderId: order.id,
        tenantId: tenant.id,
        purchaseNumber: String(order.purchaseNumber),
        pickupPin: order.pickupPin ?? pickupPin,
        total: order.total,
        paymentStatus: "pending",
        expiresAt: paymentExpiresAt.toISOString(),
        secondsRemaining,
      };

      await idempotency.complete(claim.recordId, 201, response);

      return response;
    });
  }
}
