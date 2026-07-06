import { randomUUID } from "node:crypto";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { CartRepository } from "@/features/cart/infrastructure/cart.repository";
import {
  CartRevalidationError,
  centsToMoney,
  createCartSchema,
  revalidateCartSelection,
} from "@/features/cart/domain/cart.rules";
import {
  PublicTenantService,
  type PublicTenant,
} from "@/features/tenancy/application/public-tenant.service";
import { IdempotencyService } from "@/lib/idempotency/idempotency.service";
import { createVerifiedTenantContext } from "@/lib/tenant-context/types";

export class CartNotFoundError extends Error {}
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
      const cart = await repository.create({
        locationId: tenant.locationId,
        currency: tenant.currency,
        subtotal: centsToMoney(subtotalCents),
        total: centsToMoney(subtotalCents),
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
      const cart = await new CartRepository(transaction, tenant.id).find(cartId);
      if (!cart || cart.expiresAt <= this.now() || cart.status === "expired") {
        throw new CartNotFoundError("Cart not found.");
      }
      return cart;
    });
  }
}
