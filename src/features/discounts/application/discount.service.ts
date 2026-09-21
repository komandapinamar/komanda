import "server-only";

import { withTenantTransaction } from "@/db/tenant-transaction";
import {
  CreateDiscountSchema,
  UpdateDiscountSchema,
  formatDiscountOutput,
  type DiscountOutput,
  type DiscountStatus,
} from "@/features/discounts/domain/discount.schemas";
import { DiscountRepository } from "@/features/discounts/infrastructure/discount.repository";
import type { TenantContext } from "@/lib/tenant-context/types";

export class DiscountNotFoundError extends Error {}
export class DiscountConflictError extends Error {}
export class DiscountRuleViolationError extends Error {}

export class DiscountService {
  constructor(private readonly now: () => Date = () => new Date()) {}

  async createDiscount(
    context: TenantContext,
    value: unknown,
  ): Promise<DiscountOutput> {
    const input = CreateDiscountSchema.parse(value);

    return withTenantTransaction(context, async (transaction) => {
      const repository = new DiscountRepository(transaction, context.tenantId);

      const existing = await repository.findByCode(input.code);
      if (existing) {
        throw new DiscountConflictError(
          `A discount with code "${input.code.trim().toUpperCase()}" already exists for this store.`,
        );
      }

      const created = await repository.create(input);
      return formatDiscountOutput(created, this.now());
    });
  }

  async listDiscounts(
    context: TenantContext,
    options?: {
      limit?: number;
      offset?: number;
      status?: string;
    },
  ): Promise<{ items: DiscountOutput[]; total: number }> {
    return withTenantTransaction(context, async (transaction) => {
      const repository = new DiscountRepository(transaction, context.tenantId);
      const { items, total } = await repository.list(options);

      const formatted = items.map((item) =>
        formatDiscountOutput(item, this.now()),
      );

      if (options?.status && options.status !== "all") {
        const filtered = formatted.filter(
          (item) => item.status === (options.status as DiscountStatus),
        );
        return {
          items: filtered,
          total: filtered.length,
        };
      }

      return {
        items: formatted,
        total,
      };
    });
  }

  async getDiscount(
    context: TenantContext,
    id: string,
  ): Promise<DiscountOutput> {
    return withTenantTransaction(context, async (transaction) => {
      const repository = new DiscountRepository(transaction, context.tenantId);
      const discount = await repository.findById(id);

      if (!discount) {
        throw new DiscountNotFoundError("Discount not found.");
      }

      return formatDiscountOutput(discount, this.now());
    });
  }

  async updateDiscount(
    context: TenantContext,
    id: string,
    value: unknown,
    versionHeader?: number,
  ): Promise<DiscountOutput> {
    const input = UpdateDiscountSchema.parse(value);
    const expectedVersion = versionHeader ?? input.version;

    return withTenantTransaction(context, async (transaction) => {
      const repository = new DiscountRepository(transaction, context.tenantId);
      const existing = await repository.findById(id);

      if (!existing) {
        throw new DiscountNotFoundError("Discount not found.");
      }

      if (
        expectedVersion !== undefined &&
        existing.version !== expectedVersion
      ) {
        throw new DiscountConflictError(
          "Version conflict: discount was updated by another process.",
        );
      }

      const updated = await repository.update(id, input, expectedVersion);
      if (!updated) {
        throw new DiscountConflictError(
          "Failed to update discount due to a version conflict or concurrent deletion.",
        );
      }

      return formatDiscountOutput(updated, this.now());
    });
  }

  async archiveDiscount(
    context: TenantContext,
    id: string,
  ): Promise<{ success: true }> {
    return withTenantTransaction(context, async (transaction) => {
      const repository = new DiscountRepository(transaction, context.tenantId);
      const existing = await repository.findById(id);

      if (!existing) {
        throw new DiscountNotFoundError("Discount not found.");
      }

      const deleted = await repository.softDelete(id);
      if (!deleted) {
        throw new DiscountNotFoundError("Discount not found.");
      }

      return { success: true };
    });
  }
}
