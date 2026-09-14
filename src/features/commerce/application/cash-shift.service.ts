import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { withTenantTransaction } from "@/db/tenant-transaction";
import { cashShifts, tenantOrders } from "@/db/schema";
import type { TenantContext } from "@/lib/tenant-context/types";

export class CashShiftConflictError extends Error {}
export class CashShiftNotFoundError extends Error {}

const openShiftSchema = z
  .object({
    openingBalance: z.string().regex(/^\d+(\.\d{2})?$/),
    locationId: z.string().uuid().optional(),
    notes: z.string().max(1000).optional(),
  })
  .strict();

const closeShiftSchema = z
  .object({
    closingBalance: z.string().regex(/^\d+(\.\d{2})?$/),
    notes: z.string().max(1000).optional(),
  })
  .strict();

export class CashShiftService {
  async getCurrent(context: TenantContext) {
    return withTenantTransaction(context, async (transaction) => {
      const [shift] = await transaction
        .select()
        .from(cashShifts)
        .where(
          and(
            eq(cashShifts.tenantId, context.tenantId),
            eq(cashShifts.status, "open"),
          ),
        )
        .limit(1);

      if (!shift) return null;

      const [sales] = await transaction
        .select({
          totalCash: sql<string>`coalesce(sum(${tenantOrders.total}), 0)::text`,
          orderCount: sql<number>`count(*)::int`,
        })
        .from(tenantOrders)
        .where(
          and(
            eq(tenantOrders.tenantId, context.tenantId),
            eq(tenantOrders.tender, "cash"),
            eq(tenantOrders.paymentStatus, "paid"),
            sql`${tenantOrders.createdAt} >= ${shift.openedAt}`,
          ),
        );

      const opening = Number(shift.openingBalance) || 0;
      const cashSales = Number(sales?.totalCash) || 0;
      const expectedCash = (opening + cashSales).toFixed(2);

      return {
        ...shift,
        currentCashSales: sales?.totalCash ?? "0.00",
        orderCount: sales?.orderCount ?? 0,
        expectedCash,
      };
    });
  }

  async open(context: TenantContext, value: unknown) {
    const input = openShiftSchema.parse(value);
    const userId = context.actor.kind === "user" ? context.actor.userId : "system";

    return withTenantTransaction(context, async (transaction) => {
      const [existing] = await transaction
        .select()
        .from(cashShifts)
        .where(
          and(
            eq(cashShifts.tenantId, context.tenantId),
            eq(cashShifts.status, "open"),
          ),
        )
        .limit(1);

      if (existing) {
        throw new CashShiftConflictError("Ya existe un turno de caja abierto.");
      }

      const formattedOpening = input.openingBalance.includes(".")
        ? input.openingBalance
        : `${input.openingBalance}.00`;

      const [shift] = await transaction
        .insert(cashShifts)
        .values({
          tenantId: context.tenantId,
          locationId: input.locationId ?? null,
          openedByUserId: userId,
          openingBalance: formattedOpening,
          status: "open",
          notes: input.notes ?? null,
        })
        .returning();

      return shift;
    });
  }

  async close(context: TenantContext, shiftId: string, value: unknown) {
    const input = closeShiftSchema.parse(value);

    return withTenantTransaction(context, async (transaction) => {
      const [shift] = await transaction
        .select()
        .from(cashShifts)
        .where(
          and(
            eq(cashShifts.tenantId, context.tenantId),
            eq(cashShifts.id, shiftId),
          ),
        )
        .limit(1);

      if (!shift) {
        throw new CashShiftNotFoundError("Turno de caja no encontrado.");
      }
      if (shift.status !== "open") {
        throw new CashShiftConflictError("El turno de caja ya se encuentra cerrado.");
      }

      const now = new Date();

      const [sales] = await transaction
        .select({
          totalCash: sql<string>`coalesce(sum(${tenantOrders.total}), 0)::text`,
          orderCount: sql<number>`count(*)::int`,
        })
        .from(tenantOrders)
        .where(
          and(
            eq(tenantOrders.tenantId, context.tenantId),
            eq(tenantOrders.tender, "cash"),
            eq(tenantOrders.paymentStatus, "paid"),
            sql`${tenantOrders.createdAt} >= ${shift.openedAt}`,
            sql`${tenantOrders.createdAt} <= ${now}`,
          ),
        );

      const opening = Number(shift.openingBalance) || 0;
      const cashSales = Number(sales?.totalCash) || 0;
      const expectedCash = (opening + cashSales).toFixed(2);
      const formattedClosing = input.closingBalance.includes(".")
        ? input.closingBalance
        : `${input.closingBalance}.00`;

      const [updated] = await transaction
        .update(cashShifts)
        .set({
          status: "closed",
          closingBalance: formattedClosing,
          expectedCash,
          closedAt: now,
          notes: input.notes ?? shift.notes,
          updatedAt: now,
        })
        .where(eq(cashShifts.id, shiftId))
        .returning();

      return {
        ...updated,
        cashSales: sales?.totalCash ?? "0.00",
        orderCount: sales?.orderCount ?? 0,
      };
    });
  }
}
