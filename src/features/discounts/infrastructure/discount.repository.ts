import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  discountRedemptions,
  discounts,
  type DiscountScope,
  type DiscountType,
} from "@/db/schema/discounts";
import type { TenantTransaction } from "@/db/tenant-transaction";

export type DiscountRow = typeof discounts.$inferSelect;

export type CreateDiscountInput = {
  code: string;
  name: string;
  description?: string | null;
  discountType: DiscountType;
  discountValue: string;
  minOrderAmount?: string;
  maxRedemptions?: number | null;
  startsAt?: Date;
  endsAt?: Date | null;
  scope?: DiscountScope;
  targetCategoryIds?: string[];
  targetItemIds?: string[];
  isActive?: boolean;
};

export type UpdateDiscountInput = {
  name?: string;
  description?: string | null;
  discountValue?: string;
  minOrderAmount?: string;
  maxRedemptions?: number | null;
  startsAt?: Date;
  endsAt?: Date | null;
  scope?: DiscountScope;
  targetCategoryIds?: string[];
  targetItemIds?: string[];
  isActive?: boolean;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class DiscountRepository {
  constructor(
    private readonly transaction: TenantTransaction,
    private readonly tenantId: string,
  ) {}

  async create(input: CreateDiscountInput): Promise<DiscountRow> {
    const normalizedCode = input.code.trim().toUpperCase();
    if (!normalizedCode) {
      throw new Error("Discount code cannot be empty.");
    }

    const [created] = await this.transaction
      .insert(discounts)
      .values({
        tenantId: this.tenantId,
        code: normalizedCode,
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        discountType: input.discountType,
        discountValue: input.discountValue,
        minOrderAmount: input.minOrderAmount ?? "0",
        maxRedemptions: input.maxRedemptions ?? null,
        redemptionsCount: 0,
        startsAt: input.startsAt ?? new Date(),
        endsAt: input.endsAt ?? null,
        scope: input.scope ?? "global",
        targetCategoryIds: input.targetCategoryIds ?? [],
        targetItemIds: input.targetItemIds ?? [],
        isActive: input.isActive ?? true,
        version: 1,
      })
      .returning();

    return created;
  }

  async findById(id: string): Promise<DiscountRow | null> {
    if (!UUID_REGEX.test(id)) {
      return null;
    }

    const [row] = await this.transaction
      .select()
      .from(discounts)
      .where(
        and(
          eq(discounts.tenantId, this.tenantId),
          eq(discounts.id, id),
          isNull(discounts.deletedAt),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async findByCode(code: string): Promise<DiscountRow | null> {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      return null;
    }

    const [row] = await this.transaction
      .select()
      .from(discounts)
      .where(
        and(
          eq(discounts.tenantId, this.tenantId),
          eq(discounts.code, normalizedCode),
          isNull(discounts.deletedAt),
        ),
      )
      .limit(1);

    return row ?? null;
  }

  async list(options?: {
    limit?: number;
    offset?: number;
  }): Promise<{ items: DiscountRow[]; total: number }> {
    const rawLimit = Number.isFinite(options?.limit) ? options!.limit! : 50;
    const limit = Math.min(Math.max(rawLimit, 1), 100);
    const rawOffset = Number.isFinite(options?.offset) ? options!.offset! : 0;
    const offset = Math.max(rawOffset, 0);

    const conditions = and(
      eq(discounts.tenantId, this.tenantId),
      isNull(discounts.deletedAt),
    );

    const [countResult] = await this.transaction
      .select({ count: sql<number>`count(*)::int` })
      .from(discounts)
      .where(conditions);

    const items = await this.transaction
      .select()
      .from(discounts)
      .where(conditions)
      .orderBy(desc(discounts.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      items,
      total: countResult?.count ?? 0,
    };
  }

  async update(
    id: string,
    input: UpdateDiscountInput,
    currentVersion?: number,
  ): Promise<DiscountRow | null> {
    if (!UUID_REGEX.test(id)) {
      return null;
    }

    const whereConditions = [
      eq(discounts.tenantId, this.tenantId),
      eq(discounts.id, id),
      isNull(discounts.deletedAt),
    ];

    if (typeof currentVersion === "number") {
      whereConditions.push(eq(discounts.version, currentVersion));
    }

    const setValues: Record<string, unknown> = {
      updatedAt: new Date(),
      version: sql`${discounts.version} + 1`,
    };

    if (input.name !== undefined) setValues.name = input.name.trim();
    if (input.description !== undefined)
      setValues.description = input.description?.trim() ?? null;
    if (input.discountValue !== undefined)
      setValues.discountValue = input.discountValue;
    if (input.minOrderAmount !== undefined)
      setValues.minOrderAmount = input.minOrderAmount;
    if (input.maxRedemptions !== undefined)
      setValues.maxRedemptions = input.maxRedemptions;
    if (input.startsAt !== undefined) setValues.startsAt = input.startsAt;
    if (input.endsAt !== undefined) setValues.endsAt = input.endsAt;
    if (input.scope !== undefined) setValues.scope = input.scope;
    if (input.targetCategoryIds !== undefined)
      setValues.targetCategoryIds = input.targetCategoryIds;
    if (input.targetItemIds !== undefined)
      setValues.targetItemIds = input.targetItemIds;
    if (input.isActive !== undefined) setValues.isActive = input.isActive;

    const [updated] = await this.transaction
      .update(discounts)
      .set(setValues)
      .where(and(...whereConditions))
      .returning();

    return updated ?? null;
  }

  async softDelete(id: string): Promise<boolean> {
    if (!UUID_REGEX.test(id)) {
      return false;
    }

    const [deleted] = await this.transaction
      .update(discounts)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        version: sql`${discounts.version} + 1`,
      })
      .where(
        and(
          eq(discounts.tenantId, this.tenantId),
          eq(discounts.id, id),
          isNull(discounts.deletedAt),
        ),
      )
      .returning({ id: discounts.id });

    return Boolean(deleted);
  }

  async recordRedemption(input: {
    orderId: string;
    cartId: string;
    discountId: string;
    amountDeducted: string;
    codeSnapshot: string;
  }): Promise<boolean> {
    const [updated] = await this.transaction
      .update(discounts)
      .set({
        redemptionsCount: sql`${discounts.redemptionsCount} + 1`,
        updatedAt: new Date(),
        version: sql`${discounts.version} + 1`,
      })
      .where(
        and(
          eq(discounts.tenantId, this.tenantId),
          eq(discounts.id, input.discountId),
          sql`(${discounts.maxRedemptions} IS NULL OR ${discounts.redemptionsCount} < ${discounts.maxRedemptions})`,
        ),
      )
      .returning({ id: discounts.id });

    await this.transaction
      .insert(discountRedemptions)
      .values({
        tenantId: this.tenantId,
        discountId: input.discountId,
        orderId: input.orderId,
        cartId: input.cartId,
        amountDeducted: input.amountDeducted,
        codeSnapshot: input.codeSnapshot,
        redeemedAt: new Date(),
      })
      .onConflictDoNothing();

    return Boolean(updated);
  }

  async markRedemptionCancelled(orderId: string): Promise<boolean> {
    const [updated] = await this.transaction
      .update(discountRedemptions)
      .set({
        status: "order_cancelled",
      })
      .where(
        and(
          eq(discountRedemptions.tenantId, this.tenantId),
          eq(discountRedemptions.orderId, orderId),
        ),
      )
      .returning({ id: discountRedemptions.id });

    return Boolean(updated);
  }
}
