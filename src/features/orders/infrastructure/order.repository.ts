import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import {
  carts,
  orderEvents,
  orderLineOptions,
  orderLines,
  paymentAttempts,
  tenantOrders,
} from "@/db/schema";
import type { TenantTransaction } from "@/db/tenant-transaction";
import { CartRepository } from "@/features/cart/infrastructure/cart.repository";
import { OrderConflictError } from "@/features/orders/application/order-errors";
import type {
  FulfillmentStatus,
  PaymentStatus,
} from "@/features/orders/domain/order.rules";
import type { TenantContext } from "@/lib/tenant-context/types";
import { redactSensitiveData } from "@/lib/observability/request-context";

type StoredCart = NonNullable<Awaited<ReturnType<CartRepository["find"]>>>;
type OrderRecord = typeof tenantOrders.$inferSelect;
type OrderLineRecord = typeof orderLines.$inferSelect;
type OrderLineOptionRecord = typeof orderLineOptions.$inferSelect;

export type OrderSource = "mercadopago_webhook" | "admin_direct";

export type OrderView = {
  id: string;
  tenantId: string;
  locationId: string;
  cartId: string;
  paymentAttemptId: string | null;
  purchaseNumber: string;
  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: PaymentStatus;
  source: OrderSource;
  customer: Record<string, unknown>;
  notes: string | null;
  lines: Array<{
    id: string;
    sourceItemId: string | null;
    sourceComboId: string | null;
    name: string;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    imageUrl: string | null;
    note: string | null;
    options: Array<{
      id: string;
      addonGroupId: string | null;
      addonOptionId: string | null;
      name: string;
      priceDelta: string;
      quantity: number;
    }>;
  }>;
  subtotal: string;
  discountTotal: string;
  total: string;
  currency: string;
  version: number;
  approvedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderEventView = {
  id: string;
  orderId: string;
  sequence: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
};

function actorUserId(context: TenantContext) {
  return context.actor.kind === "user" ? context.actor.userId : null;
}

function dateToIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function serializeOrder(
  order: OrderRecord,
  lines: OrderLineRecord[],
  options: OrderLineOptionRecord[],
): OrderView {
  return {
    id: order.id,
    tenantId: order.tenantId,
    locationId: order.locationId,
    cartId: order.cartId,
    paymentAttemptId: order.paymentAttemptId,
    purchaseNumber: order.purchaseNumber.toString(),
    fulfillmentStatus: order.fulfillmentStatus,
    paymentStatus: order.paymentStatus,
    source: order.source,
    customer: order.customerSnapshot,
    notes: order.notes,
    lines: lines.map((line) => ({
      id: line.id,
      sourceItemId: line.sourceItemId,
      sourceComboId: line.sourceComboId,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      imageUrl: line.imageUrl,
      note: line.note,
      options: options
        .filter((option) => option.orderLineId === line.id)
        .map((option) => ({
          id: option.id,
          addonGroupId: option.addonGroupId,
          addonOptionId: option.addonOptionId,
          name: option.name,
          priceDelta: option.priceDelta,
          quantity: option.quantity,
        })),
    })),
    subtotal: order.subtotal,
    discountTotal: order.discountTotal,
    total: order.total,
    currency: order.currency,
    version: order.version,
    approvedAt: dateToIso(order.approvedAt),
    deliveredAt: dateToIso(order.deliveredAt),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function serializeEvent(event: typeof orderEvents.$inferSelect): OrderEventView {
  return {
    id: event.id,
    orderId: event.orderId,
    sequence: event.sequence.toString(),
    eventType: event.eventType,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    metadata: event.metadata,
    occurredAt: event.occurredAt.toISOString(),
  };
}

export class OrderRepository {
  constructor(
    private readonly transaction: TenantTransaction,
    private readonly context: TenantContext,
  ) {}

  private get tenantId() {
    return this.context.tenantId;
  }

  private async nextCounter(counterType: string) {
    const result = await this.transaction.execute<{ current_value: string }>(sql`
      insert into tenant_counters (tenant_id, counter_type, current_value)
      values (${this.tenantId}::uuid, ${counterType}, 1)
      on conflict (tenant_id, counter_type)
      do update set current_value = tenant_counters.current_value + 1,
                    updated_at = now()
      returning current_value
    `);
    const row = result.rows[0];
    if (!row) throw new Error(`Failed to allocate ${counterType}.`);
    return BigInt(row.current_value);
  }

  async loadCart(cartId: string) {
    return new CartRepository(this.transaction, this.tenantId).find(cartId);
  }

  async loadPaymentAttempt(paymentAttemptId: string) {
    const [attempt] = await this.transaction
      .select()
      .from(paymentAttempts)
      .where(
        and(
          eq(paymentAttempts.tenantId, this.tenantId),
          eq(paymentAttempts.id, paymentAttemptId),
        ),
      )
      .limit(1);
    return attempt ?? null;
  }

  async findById(orderId: string) {
    const [order] = await this.transaction
      .select()
      .from(tenantOrders)
      .where(
        and(eq(tenantOrders.tenantId, this.tenantId), eq(tenantOrders.id, orderId)),
      )
      .limit(1);
    if (!order) return null;
    return this.hydrate(order);
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    const [order] = await this.transaction
      .select()
      .from(tenantOrders)
      .where(
        and(
          eq(tenantOrders.tenantId, this.tenantId),
          eq(tenantOrders.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (!order) return null;
    return this.hydrate(order);
  }

  async list(input: {
    status?: FulfillmentStatus;
    cursor?: string | null;
    limit?: number;
  }) {
    const limit = input.limit ?? 50;
    const conditions = [eq(tenantOrders.tenantId, this.tenantId)];
    if (input.status) {
      conditions.push(eq(tenantOrders.fulfillmentStatus, input.status));
    } else {
      conditions.push(
        inArray(tenantOrders.fulfillmentStatus, [
          "approved",
          "preparing",
          "ready",
        ]),
      );
    }
    if (input.cursor) {
      conditions.push(sql`${tenantOrders.createdAt} < ${new Date(input.cursor)}`);
    }

    const rows = await this.transaction
      .select()
      .from(tenantOrders)
      .where(and(...conditions))
      .orderBy(desc(tenantOrders.createdAt), desc(tenantOrders.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const orders = await Promise.all(page.map((order) => this.hydrate(order)));
    const last = page.at(-1);
    return {
      data: orders,
      nextCursor: rows.length > limit && last ? last.createdAt.toISOString() : null,
    };
  }

  async createFromCartSnapshot(input: {
    cart: StoredCart;
    source: OrderSource;
    paymentStatus: PaymentStatus;
    customer: Record<string, unknown>;
    notes?: string;
    idempotencyKey: string;
    paymentAttemptId?: string | null;
    approvedAt?: Date | null;
  }) {
    const existing = await this.findByIdempotencyKey(input.idempotencyKey);
    if (existing) {
      return { order: existing, created: false };
    }

    const [cartCheck] = await this.transaction
      .select({ status: carts.status })
      .from(carts)
      .where(
        and(eq(carts.tenantId, this.tenantId), eq(carts.id, input.cart.id)),
      )
      .limit(1);
    if (!cartCheck || cartCheck.status === "converted") {
      throw new OrderConflictError("Cart is already converted to an order.");
    }

    const now = new Date();
    const purchaseNumber = await this.nextCounter("purchase_number");
    const [order] = await this.transaction
      .insert(tenantOrders)
      .values({
        tenantId: this.tenantId,
        locationId: input.cart.locationId,
        cartId: input.cart.id,
        paymentAttemptId: input.paymentAttemptId ?? null,
        purchaseNumber,
        source: input.source,
        fulfillmentStatus: "approved",
        paymentStatus: input.paymentStatus,
        customerSnapshot: redactSensitiveData(input.customer) as Record<string, unknown>,
        notes: input.notes,
        subtotal: input.cart.subtotal,
        discountTotal: input.cart.discountTotal,
        total: input.cart.total,
        currency: input.cart.currency,
        idempotencyKey: input.idempotencyKey,
        approvedAt: input.approvedAt ?? now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!order) throw new Error("Failed to create order.");

    for (const cartLine of input.cart.lines) {
      const [line] = await this.transaction
        .insert(orderLines)
        .values({
          tenantId: this.tenantId,
          orderId: order.id,
          sourceItemId: cartLine.itemId,
          sourceComboId: cartLine.comboId,
          name: cartLine.nameSnapshot,
          quantity: cartLine.quantity,
          unitPrice: cartLine.unitPriceSnapshot,
          lineTotal: cartLine.lineTotal,
          imageUrl: cartLine.imageUrlSnapshot,
          note: cartLine.note,
        })
        .returning({ id: orderLines.id });

      if (cartLine.options.length > 0) {
        await this.transaction.insert(orderLineOptions).values(
          cartLine.options.map((option) => ({
            tenantId: this.tenantId,
            orderLineId: line!.id,
            addonGroupId: option.addonGroupId,
            addonOptionId: option.addonOptionId,
            name: option.nameSnapshot,
            priceDelta: option.priceDeltaSnapshot,
            quantity: option.quantity,
          })),
        );
      }
    }

    await this.transaction
      .update(carts)
      .set({ status: "converted", updatedAt: now })
      .where(and(eq(carts.tenantId, this.tenantId), eq(carts.id, input.cart.id)));

    const hydrated = await this.hydrate(order);
    await this.appendEvent({
      orderId: order.id,
      eventType: "order.created",
      toStatus: "approved",
      metadata: {
        source: input.source,
        paymentStatus: input.paymentStatus,
      },
    });
    return { order: hydrated, created: true };
  }

  async transition(input: {
    orderId: string;
    expectedVersion: number;
    nextStatus: FulfillmentStatus;
  }) {
    const [updated] = await this.transaction
      .update(tenantOrders)
      .set({
        fulfillmentStatus: input.nextStatus,
        deliveredAt: input.nextStatus === "delivered" ? new Date() : undefined,
        version: sql`${tenantOrders.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(tenantOrders.tenantId, this.tenantId),
          eq(tenantOrders.id, input.orderId),
          eq(tenantOrders.version, input.expectedVersion),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async appendTransitionEvent(input: {
    orderId: string;
    fromStatus: FulfillmentStatus | null;
    toStatus: FulfillmentStatus;
  }) {
    return this.appendEvent({
      orderId: input.orderId,
      eventType: "order.transitioned",
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
    });
  }

  async listEventsAfter(sequence: bigint, limit = 100) {
    const rows = await this.transaction
      .select()
      .from(orderEvents)
      .where(
        and(
          eq(orderEvents.tenantId, this.tenantId),
          gt(orderEvents.sequence, sequence),
        ),
      )
      .orderBy(asc(orderEvents.sequence))
      .limit(limit);
    return rows.map(serializeEvent);
  }

  private async hydrate(order: OrderRecord) {
    const lines = await this.transaction
      .select()
      .from(orderLines)
      .where(
        and(eq(orderLines.tenantId, this.tenantId), eq(orderLines.orderId, order.id)),
      )
      .orderBy(asc(orderLines.createdAt));
    const lineIds = lines.map(({ id }) => id);
    const options = lineIds.length
      ? await this.transaction
          .select()
          .from(orderLineOptions)
          .where(
            and(
              eq(orderLineOptions.tenantId, this.tenantId),
              inArray(orderLineOptions.orderLineId, lineIds),
            ),
          )
      : [];
    return serializeOrder(order, lines, options);
  }

  private async appendEvent(input: {
    orderId: string;
    eventType: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const sequence = await this.nextCounter("order_event_sequence");
    const [event] = await this.transaction
      .insert(orderEvents)
      .values({
        tenantId: this.tenantId,
        orderId: input.orderId,
        sequence,
        eventType: input.eventType,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        actorUserId: actorUserId(this.context),
        metadata: redactSensitiveData(input.metadata ?? {}) as Record<string, unknown>,
      })
      .returning();
    if (!event) throw new Error("Failed to append order event.");
    return serializeEvent(event);
  }
}
