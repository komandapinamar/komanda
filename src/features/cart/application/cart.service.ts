import { randomUUID } from "node:crypto";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { CartRepository } from "@/features/cart/infrastructure/cart.repository";
import {
  CartRevalidationError,
  centsToMoney,
  createCartSchema,
  moneyToCents,
  revalidateCartSelection,
} from "@/features/cart/domain/cart.rules";
import {
  calculateDiscountAmounts,
  type IneligibilityReason,
} from "@/features/discounts/domain/discount.rules";
import { DiscountRepository } from "@/features/discounts/infrastructure/discount.repository";
import { globalDiscountRateLimiter } from "@/features/discounts/infrastructure/discount-rate-limiter";
import {
  PublicTenantService,
  type PublicTenant,
} from "@/features/tenancy/application/public-tenant.service";
import { fetchTenantReadiness } from "@/features/tenancy/application/tenant-readiness.service";
import { IdempotencyService } from "@/lib/idempotency/idempotency.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export class CartNotFoundError extends Error {}
export class RateLimitExceededError extends Error {
  constructor(public readonly retryAfterSeconds: number = 60) {
    super(
      `Demasiados intentos fallidos. Por favor reintentá en ${retryAfterSeconds} segundos.`,
    );
  }
}
export class CartDiscountIneligibleError extends Error {
  constructor(
    public readonly reason: IneligibilityReason,
    message?: string,
  ) {
    super(message ?? `El cupón no es válido para este pedido (${reason})`);
  }
}
export { CartRevalidationError } from "@/features/cart/domain/cart.rules";

function publicContext(tenant: PublicTenant) {
  return createVerifiedTenantContext({
    tenantId: tenant.id,
    locationId: tenant.locationId,
    correlationId: randomUUID(),
    source: "public",
    actor: { kind: "anonymous", tenantSlug: tenant.slug },
  });
}

export class CartService {
  constructor(
    private readonly tenants = new PublicTenantService(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(slug: string, value: unknown, idempotencyKey: string) {
    const request = createCartSchema.parse(value);
    const tenant = await this.tenants.resolve(slug);
    return withTenantTransaction(publicContext(tenant), async (transaction) => {
      const eligibility = await fetchTenantReadiness(transaction, tenant.id);
      if (!eligibility.orderingAvailable) {
        throw new CartRevalidationError(
          "Online ordering is currently unavailable for this store.",
        );
      }

      const repository = new CartRepository(transaction, tenant.id);
      const idempotency = new IdempotencyService(transaction);
      const claim = await idempotency.claim({
        tenantId: tenant.id,
        scope: "create-cart",
        key: idempotencyKey,
        request,
        retentionSeconds: 60 * 60,
      });
      if (claim.replayed) {
        const replay = claim.body as { cartId?: string };
        const cart = replay.cartId ? await repository.find(replay.cartId) : null;
        if (!cart) throw new CartNotFoundError("Cart not found.");
        return cart;
      }

      const lines = [];
      let subtotalCents = 0;
      for (const selection of request.lines) {
        const catalog = await repository.loadSelection(
          selection.kind,
          selection.resourceId,
        );
        if (!catalog || catalog.currency !== tenant.currency) {
          throw new CartRevalidationError("Catalog resource is unavailable.");
        }
        const validated = revalidateCartSelection(selection, catalog);
        const lineTotalCents = validated.unitPriceCents * selection.quantity;
        subtotalCents += lineTotalCents;
        lines.push({
          kind: selection.kind,
          resourceId: selection.resourceId,
          quantity: selection.quantity,
          name: catalog.name,
          unitPrice: centsToMoney(validated.unitPriceCents),
          lineTotal: centsToMoney(lineTotalCents),
          imageUrl: catalog.imageUrl,
          note: selection.note,
          options: validated.options,
        });
      }

      let initialDiscountTotal = "0";
      let initialTotalCents = subtotalCents;
      let appliedDiscountCodeId: string | null = null;
      let discountMetadata: {
        code: string;
        name: string;
        discountType: string;
        discountValue: string;
        savingsAmount: string;
      } | null = null;

      if (request.discountCode) {
        const discountRepo = new DiscountRepository(transaction, tenant.id);
        const discount = await discountRepo.findByCode(request.discountCode);
        if (discount) {
          const linesForDiscount = lines.map((line, index) => ({
            id: `line-${index}`,
            resourceId: line.resourceId,
            quantity: line.quantity,
            unitPriceCents: moneyToCents(line.unitPrice),
            lineTotalCents: moneyToCents(line.lineTotal),
          }));

          const calcResult = calculateDiscountAmounts({
            lines: linesForDiscount,
            coupon: discount,
            now: this.now(),
          });

          if (calcResult.isEligible) {
            initialDiscountTotal = calcResult.discountTotal;
            initialTotalCents = calcResult.totalCents;
            appliedDiscountCodeId = discount.id;
            discountMetadata = {
              code: discount.code,
              name: discount.name,
              discountType: discount.discountType,
              discountValue: discount.discountValue,
              savingsAmount: calcResult.discountTotal,
            };
          }
        }
      }

      const cart = await repository.create({
        locationId: tenant.locationId,
        currency: tenant.currency,
        subtotal: centsToMoney(subtotalCents),
        discountTotal: initialDiscountTotal,
        total: centsToMoney(initialTotalCents),
        appliedDiscountCodeId,
        discountMetadata,
        expiresAt: new Date(this.now().getTime() + 30 * 60 * 1000),
        lines,
      });
      if (!cart) throw new Error("Failed to create cart.");
      await idempotency.complete(claim.recordId, 201, { cartId: cart.id });
      return cart;
    });
  }

  async get(slug: string, cartId: string) {
    const tenant = await this.tenants.resolve(slug);
    return withTenantTransaction(publicContext(tenant), async (transaction) => {
      const repository = new CartRepository(transaction, tenant.id);
      let cart = await new CartRepository(transaction, tenant.id).find(cartId);
      if (!cart || cart.expiresAt <= this.now() || cart.status === "expired") {
        throw new CartNotFoundError("Cart not found.");
      }

      // Reactive Revalidation of Applied Discount
      if (cart.appliedDiscountCodeId) {
        const discountRepo = new DiscountRepository(transaction, tenant.id);
        const discount = await discountRepo.findById(cart.appliedDiscountCodeId);

        const linesForDiscount = cart.lines.map((line) => ({
          id: line.id,
          resourceId: line.itemId ?? line.comboId,
          quantity: line.quantity,
          unitPriceCents: moneyToCents(line.unitPriceSnapshot),
          lineTotalCents: moneyToCents(line.lineTotal),
        }));

        if (!discount) {
          cart = await repository.removeDiscount(cartId, cart.subtotal);
          return {
            ...cart!,
            invalidatedDiscountReason: "DISCOUNT_NOT_FOUND",
          };
        }

        const calcResult = calculateDiscountAmounts({
          lines: linesForDiscount,
          coupon: discount,
          now: this.now(),
        });

        if (!calcResult.isEligible) {
          cart = await repository.removeDiscount(cartId, cart.subtotal);
          return {
            ...cart!,
            invalidatedDiscountReason: calcResult.ineligibilityReason,
          };
        }

        if (
          calcResult.discountTotal !== cart.discountTotal ||
          calcResult.total !== cart.total
        ) {
          cart = await repository.applyDiscount(cartId, {
            discountTotal: calcResult.discountTotal,
            total: calcResult.total,
            appliedDiscountCodeId: discount.id,
            discountMetadata: {
              code: discount.code,
              name: discount.name,
              discountType: discount.discountType,
              discountValue: discount.discountValue,
              savingsAmount: calcResult.discountTotal,
            },
          });
        }
      }

      return cart;
    });
  }

  async applyDiscount(
    slug: string,
    cartId: string,
    code: string,
    clientIp: string = "unknown",
  ) {
    const rateLimitKey = `${clientIp}:${slug}`;
    const rateLimit = globalDiscountRateLimiter.checkRateLimit(
      rateLimitKey,
      this.now().getTime(),
    );
    if (!rateLimit.allowed) {
      throw new RateLimitExceededError(rateLimit.retryAfterSeconds);
    }

    const tenant = await this.tenants.resolve(slug);
    return withTenantTransaction(publicContext(tenant), async (transaction) => {
      const cartRepo = new CartRepository(transaction, tenant.id);
      const cart = await cartRepo.find(cartId);

      if (!cart || cart.expiresAt <= this.now() || cart.status === "expired") {
        throw new CartNotFoundError("Cart not found.");
      }

      const discountRepo = new DiscountRepository(transaction, tenant.id);
      const discount = await discountRepo.findByCode(code);

      if (!discount) {
        globalDiscountRateLimiter.recordFailure(
          rateLimitKey,
          this.now().getTime(),
        );
        throw new CartDiscountIneligibleError(
          "DISCOUNT_NOT_FOUND" as IneligibilityReason,
          "Código de descuento no encontrado.",
        );
      }

      const linesForDiscount = cart.lines.map((line) => ({
        id: line.id,
        resourceId: line.itemId ?? line.comboId,
        quantity: line.quantity,
        unitPriceCents: moneyToCents(line.unitPriceSnapshot),
        lineTotalCents: moneyToCents(line.lineTotal),
      }));

      const calcResult = calculateDiscountAmounts({
        lines: linesForDiscount,
        coupon: discount,
        now: this.now(),
      });

      if (!calcResult.isEligible) {
        globalDiscountRateLimiter.recordFailure(
          rateLimitKey,
          this.now().getTime(),
        );
        let msg = "El cupón no puede ser aplicado a este pedido.";
        if (calcResult.ineligibilityReason === "MIN_ORDER_NOT_MET") {
          msg = `Este cupón requiere una compra mínima de $${discount.minOrderAmount}`;
        } else if (calcResult.ineligibilityReason === "DISCOUNT_EXPIRED") {
          msg = "Este código de descuento ha expirado.";
        } else if (calcResult.ineligibilityReason === "DISCOUNT_LIMIT_REACHED") {
          msg = "Este cupón ha alcanzado su límite máximo de usos.";
        } else if (calcResult.ineligibilityReason === "NO_QUALIFYING_ITEMS") {
          msg = "Tu carrito no incluye productos alcanzados por este cupón.";
        }
        throw new CartDiscountIneligibleError(
          calcResult.ineligibilityReason ?? ("DISCOUNT_INACTIVE" as IneligibilityReason),
          msg,
        );
      }

      globalDiscountRateLimiter.recordSuccess(rateLimitKey);

      const updated = await cartRepo.applyDiscount(cartId, {
        discountTotal: calcResult.discountTotal,
        total: calcResult.total,
        appliedDiscountCodeId: discount.id,
        discountMetadata: {
          code: discount.code,
          name: discount.name,
          discountType: discount.discountType,
          discountValue: discount.discountValue,
          savingsAmount: calcResult.discountTotal,
        },
      });

      if (!updated) {
        throw new Error("Failed to apply discount to cart.");
      }

      return updated;
    });
  }

  async removeDiscount(slug: string, cartId: string) {
    const tenant = await this.tenants.resolve(slug);
    return withTenantTransaction(publicContext(tenant), async (transaction) => {
      const cartRepo = new CartRepository(transaction, tenant.id);
      const cart = await cartRepo.find(cartId);

      if (!cart || cart.expiresAt <= this.now() || cart.status === "expired") {
        throw new CartNotFoundError("Cart not found.");
      }

      const updated = await cartRepo.removeDiscount(cartId, cart.subtotal);
      if (!updated) {
        throw new Error("Failed to remove discount from cart.");
      }

      return updated;
    });
  }
}
