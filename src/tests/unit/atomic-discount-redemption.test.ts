import { describe, expect, it, vi } from "vitest";
import { DiscountRepository } from "@/features/discounts/infrastructure/discount.repository";
import type { TenantTransaction } from "@/db/tenant-transaction";
import { discounts, discountRedemptions } from "@/db/schema/discounts";

describe("Story 3.3: Atomic Discount Redemption & Immutable Order Snapshot", () => {
  const tenantId = "00000000-0000-4000-8000-000000000001";
  const discountId = "00000000-0000-4000-8000-000000000099";

  it("atomically increments redemptions_count and inserts audit record", async () => {
    let updateExecuted = false;
    let insertAuditExecuted = false;

    const mockTx = {
      update: vi.fn().mockImplementation((table) => {
        if (table === discounts) {
          updateExecuted = true;
          return {
            set: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: discountId }]),
              }),
            }),
          };
        }
        return {};
      }),
      insert: vi.fn().mockImplementation((table) => {
        if (table === discountRedemptions) {
          insertAuditExecuted = true;
          return {
            values: vi.fn().mockReturnValue({
              onConflictDoNothing: vi.fn().mockResolvedValue({}),
            }),
          };
        }
        return {};
      }),
    } as unknown as TenantTransaction;

    const repo = new DiscountRepository(mockTx, tenantId);
    const success = await repo.recordRedemption({
      orderId: "order-1",
      cartId: "cart-1",
      discountId,
      amountDeducted: "2000.00",
      codeSnapshot: "BURGER20",
    });

    expect(success).toBe(true);
    expect(updateExecuted).toBe(true);
    expect(insertAuditExecuted).toBe(true);
  });

  it("returns false if coupon is exhausted and update affects 0 rows", async () => {
    const mockTx = {
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([]), // 0 rows updated
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockResolvedValue({}),
        }),
      }),
    } as unknown as TenantTransaction;

    const repo = new DiscountRepository(mockTx, tenantId);
    const success = await repo.recordRedemption({
      orderId: "order-2",
      cartId: "cart-2",
      discountId,
      amountDeducted: "1500.00",
      codeSnapshot: "EXHAUSTED",
    });

    expect(success).toBe(false);
  });
});
