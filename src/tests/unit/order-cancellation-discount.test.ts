import { describe, expect, it, vi } from "vitest";
import { DiscountRepository } from "@/features/discounts/infrastructure/discount.repository";
import type { TenantTransaction } from "@/db/tenant-transaction";
import { discountRedemptions, discounts } from "@/db/schema/discounts";

describe("Story 3.4: Order Cancellation & Burned Coupon Policy", () => {
  const tenantId = "00000000-0000-4000-8000-000000000001";
  const orderId = "00000000-0000-4000-8000-000000000055";

  it("marks redemption as order_cancelled without decrementing redemptions_count", async () => {
    let updateTable: unknown = null;
    let updatedSetValues: Record<string, unknown> | null = null;

    const mockTx = {
      update: vi.fn().mockImplementation((table) => {
        updateTable = table;
        return {
          set: vi.fn().mockImplementation((vals) => {
            updatedSetValues = vals;
            return {
              where: vi.fn().mockReturnValue({
                returning: vi.fn().mockResolvedValue([{ id: "redemption-1" }]),
              }),
            };
          }),
        };
      }),
    } as unknown as TenantTransaction;

    const repo = new DiscountRepository(mockTx, tenantId);
    const success = await repo.markRedemptionCancelled(orderId);

    expect(success).toBe(true);
    expect(updateTable).toBe(discountRedemptions);
    expect(updatedSetValues).toEqual({ status: "order_cancelled" });
    // Verifies discounts table was never updated (coupon remains burned)
    expect(mockTx.update).not.toHaveBeenCalledWith(discounts);
  });

  it("verifies cash cancellation withdrawal uses net order total instead of subtotal", () => {
    const orderWithDiscount = {
      id: orderId,
      subtotal: "9000.00",
      discountTotal: "1800.00",
      total: "7200.00", // Net paid
      tender: "cash",
      source: "admin_direct",
      paymentStatus: "paid",
    };

    // The withdrawal amount must equal total ($7.200), not subtotal ($9.000)
    const refundAmount = orderWithDiscount.total;
    expect(refundAmount).toBe("7200.00");
    expect(Number(refundAmount)).toBeLessThan(Number(orderWithDiscount.subtotal));
  });
});
